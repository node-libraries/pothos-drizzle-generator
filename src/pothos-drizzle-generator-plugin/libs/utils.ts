import { collectFields } from "@graphql-tools/utils";
import * as p from "drizzle-orm";

import { GraphQLResolveInfo, FieldNode, SelectionNode } from "graphql";

function getDepthFromSelection(
  selection: SelectionNode | FieldNode,
  currentDepth: number
): number {
  if (selection.kind === "Field" && selection.selectionSet) {
    // 子フィールドがある場合はさらに深さを加算
    const childDepths = selection.selectionSet.selections.map((sel) =>
      getDepthFromSelection(sel, currentDepth + 1)
    );
    return Math.max(...childDepths);
  }
  return currentDepth;
}

export function getQueryDepth(info: GraphQLResolveInfo): number {
  return getDepthFromSelection(info.fieldNodes[0], 0);
}

export const getQueryFields = (info: GraphQLResolveInfo) => {
  return Object.fromEntries(
    Array.from(
      collectFields(
        info.schema,
        info.fragments,
        info.variableValues,
        {} as never,
        info.fieldNodes[0].selectionSet!
      ).fields.keys()
    ).map((v) => [v, true])
  );
};

const OperatorMap = {
  eq: p.eq,
  ne: p.ne,
  gt: p.gt,
  gte: p.gte,
  lt: p.lt,
  lte: p.lte,
  like: p.like,
  notLike: p.notLike,
  ilike: p.ilike,
  notIlike: p.notIlike,
  isNull: p.isNull,
  isNotNull: p.isNotNull,
  in: p.inArray,
  notIn: p.notInArray,
  arrayContained: p.arrayContained,
  arrayOverlaps: p.arrayOverlaps,
  arrayContains: p.arrayContains,
};

type OperatorType = Record<string, Record<keyof typeof OperatorMap, unknown>>;
type OperatorTree =
  | Record<"AND" | "OR", OperatorType[]>
  | Record<"NOT", OperatorType>
  | OperatorType;

export const createWhereQuery = (
  table: p.SchemaEntry,
  tree?: OperatorTree
): p.SQL | undefined => {
  if (!tree) return p.and()!;
  const result: p.SQL[] = Object.entries(tree)
    .map(([key, value]) => {
      switch (key) {
        case "AND":
          return value.length
            ? p.and(
                ...value.map((v: OperatorTree) => createWhereQuery(table, v))
              )
            : undefined;
        case "OR":
          return value.length
            ? p.or(
                ...value.map((v: OperatorTree) => createWhereQuery(table, v))
              )
            : undefined;
        case "NOT": {
          const v = createWhereQuery(table, value);
          return v ? p.not(v) : undefined;
        }
      }
      const result = Object.entries(value).map(([k, v]) => {
        const m = OperatorMap[k as keyof typeof OperatorMap];
        return (m as (column: p.SQL | p.Column, value: unknown) => p.SQL)(
          p.getColumns(table)[key],
          v
        ) as p.SQL;
      });
      if (result.length === 1) {
        return result[0] as p.SQL;
      }
      return p.and(...result);
    })
    .flatMap((v) => (v ? [v] : []));
  if (result.length === 1) return result[0] as p.SQL;
  return p.and(...result);
};

export const createInputOperator = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: PothosSchemaTypes.SchemaBuilder<any>,
  type: string | [string]
) => {
  const typeName = Array.isArray(type) ? `Array${type[0]}` : type;
  const name = `${typeName}InputOperator`;
  const inputType = builder.inputType(name, {
    fields: (t) => ({
      eq: t.field({ type }),
      ne: t.field({ type }),
      gt: t.field({ type }),
      gte: t.field({ type }),
      lt: t.field({ type }),
      lte: t.field({ type }),
      like: t.field({ type }),
      notLike: t.field({ type }),
      ilike: t.field({ type }),
      notIlike: t.field({ type }),
      isNull: t.boolean(),
      isNotNull: t.boolean(),
      in: t.field({ type: [type] as never }),
      notIn: t.field({ type: [type] as never }),
      arrayContained: t.field({ type: [type] as never }),
      arrayOverlaps: t.field({ type: [type] as never }),
      arrayContains: t.field({ type: [type] as never }),
    }),
  });
  return inputType;
};

type AggregationQueryType = {
  aggregation?: boolean;
  columns?: object;
  with: Record<string, AggregationQueryType>;
};

export const convertAggregationQuery = (query: AggregationQueryType) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { aggregation, columns, ...q } = query;
  const newQuery = aggregation ? { ...q, columns: {} } : query;
  const newWith: Record<string, AggregationQueryType> = query.with
    ? Object.fromEntries(
        Object.entries(query.with).map(([key, value]) => [
          key,
          convertAggregationQuery(value),
        ])
      )
    : query.with;

  return { ...newQuery, with: newWith };
};
