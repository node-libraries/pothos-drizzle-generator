import * as p from "drizzle-orm";
import { collectFields } from "@graphql-tools/utils";

export const getQueryFields = (info: any) => {
  return Object.fromEntries(
    Array.from(
      collectFields(
        info.schema,
        info.fragments,
        info.variableValues,
        info.rootType,
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
  tree: OperatorTree
): p.SQL => {
  const result: p.SQL[] = Object.entries(tree)
    .map(([key, value]) => {
      switch (key) {
        case "AND":
          return p.and(
            ...value.map((v: OperatorTree) => createWhereQuery(table, v))
          );
        case "OR":
          return p.or(
            ...value.map((v: OperatorTree) => createWhereQuery(table, v))
          );
        case "NOT":
          p.not(createWhereQuery(table, value));
      }
      const result = Object.entries(value).map(([k, v]) => {
        const m = OperatorMap[k as keyof typeof OperatorMap];
        return (m as any)(p.getColumns(table)[key] as any, v as any) as p.SQL;
      });
      if (result.length === 1) {
        return result[0] as p.SQL;
      }
      return p.and(...result);
    })
    .flatMap((v) => (v ? [v] : []));
  if (result.length === 1) {
    return result[0] as p.SQL;
  }
  const r = p.and(...result);
  if (!r) throw "Error convert where query";
  return r;
};

export const createInputOperator = (
  builder: PothosSchemaTypes.SchemaBuilder<any>,
  type: String | [String]
) => {
  const typeName = Array.isArray(type) ? `Array${type[0]}` : type;
  const name = `${typeName}InputOperator`;
  const inputType = builder.inputType(name, {
    fields: (t) => ({
      eq: t.field({ type: type as never }),
      ne: t.field({ type: type as never }),
      gt: t.field({ type: type as never }),
      gte: t.field({ type: type as never }),
      lt: t.field({ type: type as never }),
      lte: t.field({ type: type as never }),
      like: t.field({ type: type as never }),
      notLike: t.field({ type: type as never }),
      ilike: t.field({ type: type as never }),
      notIlike: t.field({ type: type as never }),
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
