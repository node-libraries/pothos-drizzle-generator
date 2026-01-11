import * as p from "drizzle-orm";
import { isOperation, type OperationBasic } from "../libs/operations.js";
import type { ModelData } from "../generator.js";
import type { GraphQLResolveInfo, FieldNode, SelectionNode } from "graphql";

export type ResolvedOperationParams = {
  depthLimit?: number;
  limit?: number;
  where?: object;
  orderBy?: object;
  input?: object;
};

export function checkPermissionsAndGetParams(
  modelName: string,
  operation: (typeof OperationBasic)[number],
  ctx: object,
  info: GraphQLResolveInfo | null,
  modelData: ModelData
): ResolvedOperationParams {
  const { executable, depthLimit, limit, where, orderBy, inputData } = modelData;

  if (executable?.({ modelName, ctx, operation }) === false) {
    throw new Error("No permission");
  }

  const params: ResolvedOperationParams = {
    depthLimit: depthLimit?.({ modelName, ctx, operation }),
    limit: limit?.({ modelName, ctx, operation }),
    where: where?.({ modelName, ctx, operation }),
    orderBy: orderBy?.({ modelName, ctx, operation }),
    input: isOperation("mutation", operation)
      ? inputData?.({ modelName, ctx, operation })
      : undefined,
  };

  if (info && params.depthLimit !== undefined && getQueryDepth(info) > params.depthLimit) {
    throw new Error("Depth limit exceeded");
  }

  return params;
}

function getDepthFromSelection(selection: SelectionNode | FieldNode, currentDepth: number): number {
  if (selection.kind === "Field" && selection.selectionSet) {
    const childDepths = selection.selectionSet.selections.map((sel) =>
      getDepthFromSelection(sel, currentDepth + 1)
    );
    return Math.max(currentDepth, ...childDepths);
  }
  return currentDepth;
}

export function getQueryDepth(info: GraphQLResolveInfo): number {
  return getDepthFromSelection(info.fieldNodes[0]!, 1);
}

export interface FieldTree {
  [key: string]: boolean | FieldTree;
}

export const getQueryFragment = (
  info: GraphQLResolveInfo,
  selectFields: FieldTree,
  field: SelectionNode
) => {
  if (field.kind === "FragmentSpread") {
    const fragment = info.fragments[field.name.value];
    fragment?.selectionSet.selections.forEach((selection) => {
      getQueryFragment(info, selectFields, selection);
    });
  } else if (field.kind === "Field" && field.name.value !== "__typename") {
    if (field.selectionSet?.selections.length) {
      selectFields[field.name.value] = getQueryFields(info, [field]);
    } else {
      selectFields[field.name.value] = true;
    }
  }
};

export const getQueryFields = (info: GraphQLResolveInfo, fieldNodes?: FieldNode[]) => {
  const selectFields: FieldTree = {};
  for (const fieldNode of fieldNodes ?? info.fieldNodes) {
    for (const field of fieldNode.selectionSet!.selections) {
      getQueryFragment(info, selectFields, field);
    }
  }
  return selectFields;
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

export const createWhereQuery = (table: p.SchemaEntry, tree?: OperatorTree): p.SQL | undefined => {
  if (!tree) return undefined;
  const result: p.SQL[] = Object.entries(tree)
    .map(([key, value]) => {
      switch (key) {
        case "AND":
          return value.length
            ? p.and(...value.map((v: OperatorTree) => createWhereQuery(table, v)))
            : undefined;
        case "OR":
          return value.length
            ? p.or(...value.map((v: OperatorTree) => createWhereQuery(table, v)))
            : undefined;
        case "NOT": {
          const v = createWhereQuery(table, value);
          return v ? p.not(v) : undefined;
        }
      }
      const result =
        typeof value === "object"
          ? Object.entries(value).map(([k, v]) => {
              const op = OperatorMap[k as keyof typeof OperatorMap];
              return (op as (column: p.SQL | p.Column, value: unknown) => p.SQL)(
                p.getColumns(table)[key],
                v
              ) as p.SQL;
            })
          : [p.eq(p.getColumns(table)[key], value)];
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
