import { and, eq, sql, type Column, type RelationsRecord, type SQL } from "drizzle-orm";
import { getColumn } from "./drizzle.js";
import { getQueryFields, type FieldTree } from "./graphql.js";
import type { DbClient, ModelData } from "../generator.js";
import type { ResolvedOperationParams } from "./permissions.js";
import type { GraphQLResolveInfo } from "graphql";

type QueryArgs = {
  offset?: number;
  limit?: number;
  where?: object;
  orderBy?: object[];
};

function normalizeOperator(key: string, val: unknown): [string, unknown] {
  switch (key) {
    case "contains":
      return ["like", `%${val}%`];
    case "notContains":
      return ["notLike", `%${val}%`];
    case "startsWith":
      return ["like", `${val}%`];
    case "endsWith":
      return ["like", `%${val}`];
    case "icontains":
      return ["ilike", `%${val}%`];
    case "notIcontains":
      return ["notIlike", `%${val}%`];
    case "istartsWith":
      return ["ilike", `${val}%`];
    case "iendsWith":
      return ["ilike", `%${val}`];
    default:
      return [key, val];
  }
}

export function sanitizeWhere(where: unknown): unknown {
  if (where == null) return undefined;
  if (typeof where !== "object") return where;
  if (Array.isArray(where)) {
    const arr = where.map(sanitizeWhere).filter((v) => v !== undefined);
    return arr.length > 0 ? arr : undefined;
  }
  const entries = Object.entries(where)
    .map(([key, val]) => {
      const sanitizedVal = sanitizeWhere(val);
      if (sanitizedVal === undefined) return undefined;
      const [normalizedKey, normalizedVal] = normalizeOperator(key, sanitizedVal);
      return [normalizedKey, normalizedVal] as const;
    })
    .filter((entry): entry is [string, unknown] => entry !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function combineWhere(argsWhere?: unknown, paramsWhere?: unknown): object | undefined {
  const a = sanitizeWhere(argsWhere);
  const p = sanitizeWhere(paramsWhere);

  if (a && p) return { AND: [a, p] };
  return (a ?? p) as object | undefined;
}

export function prepareQueryOptions(
  args: QueryArgs,
  params: ResolvedOperationParams,
  isMany: boolean
) {
  const where = combineWhere(args.where, params.where);

  const orderBy =
    args.orderBy && Object.keys(args.orderBy).length
      ? Object.fromEntries(args.orderBy.flatMap((v) => Object.entries(v)))
      : params.orderBy;

  const queryOptions: Omit<QueryArgs, "orderBy"> & { where?: object; orderBy?: object } = {
    ...args,
    orderBy,
  };
  if (where) {
    queryOptions.where = where;
  } else {
    delete (queryOptions as Record<string, unknown>).where;
  }

  if (args.offset != null) {
    queryOptions.offset = Math.max(0, args.offset);
  }

  if (isMany) {
    const requestedLimit = args.limit != null ? Math.max(0, args.limit) : undefined;
    queryOptions.limit =
      params.limit != null && requestedLimit != null
        ? Math.min(params.limit, requestedLimit)
        : (params.limit ?? requestedLimit);
  } else if (args.limit != null) {
    queryOptions.limit = Math.max(0, args.limit);
  }

  return queryOptions;
}

export function separateInput(
  input: object,
  columns: Pick<Column, "name">[],
  relations?: RelationsRecord
) {
  const dbColumnsInput: Record<string, unknown> = {};
  const relationFieldsInput: [string, unknown][] = [];

  for (const [key, value] of Object.entries(input)) {
    if (columns.some((col) => col.name === key)) {
      dbColumnsInput[key] = value;
    } else {
      const relay = relations?.[key];
      if (relay?.relationType === "one" && value && typeof value === "object" && "set" in value) {
        const setVal = (value as { set?: Record<string, unknown> }).set;
        if (setVal) {
          relay.sourceColumns.forEach((v, index) => {
            const srcCol = getColumn(v);
            const targetCol = getColumn(relay.targetColumns[index]);
            if (setVal[targetCol.name] !== undefined) {
              dbColumnsInput[srcCol.name] = setVal[targetCol.name];
            }
          });
        }
      } else {
        relationFieldsInput.push([key, value]);
      }
    }
  }

  return { dbColumnsInput, relationFieldsInput };
}

export async function insertRelayValue({
  results,
  client,
  relationInputs,
  relations,
}: {
  results: Record<string, unknown>[];
  client: DbClient;
  relationInputs: [string, unknown][][];
  relations: RelationsRecord;
}) {
  for (const index in results) {
    const result = results[index];
    const relationInput = relationInputs[index];
    if (!result || !relationInput?.length) continue;
    for (const [relationName, value] of relationInput) {
      const inputPayload = value as { set?: Record<string, unknown>[] };
      const itemsToSet = inputPayload.set;

      const relay = relations[relationName];
      if (!relay) continue;

      if (relay.through && relay.throughTable) {
        if (!itemsToSet) continue;
        const { throughTable } = relay;

        const sourceToThroughMap = Object.fromEntries(
          relay.sourceColumns.map((v, i) => [getColumn(v).name, relay.through!.source[i]!._.key])
        );
        const targetToThroughMap = Object.fromEntries(
          relay.targetColumns.map((v, i) => [getColumn(v).name, relay.through!.target[i]!._.key])
        );

        const sourceFilters = relay.sourceColumns.map((v) => {
          const col = getColumn(v);
          return [sourceToThroughMap[col.name], result[col.name]] as const;
        });
        await client
          .delete(throughTable as never)
          .where(
            and(...sourceFilters.map(([key, val]) => eq(relay.throughTable![key as never], val)))
          );

        const insertRows = itemsToSet.map((item) => {
          const targetValues = Object.entries(item).map(([key, val]) => [
            targetToThroughMap[key],
            val,
          ]);
          return Object.fromEntries([...targetValues, ...sourceFilters]);
        });

        if (insertRows.length > 0) {
          await client.insert(throughTable as never).values(insertRows);
        }
      } else if (relay.relationType === "many") {
        const foreignKeyMap = Object.fromEntries(
          relay.sourceColumns.map((v, i) => [
            getColumn(relay.targetColumns[i]).name,
            result[getColumn(v).name],
          ])
        );

        const createItems = (value as { create?: Record<string, unknown>[] }).create;
        if (createItems && Array.isArray(createItems) && createItems.length > 0) {
          const rowsToInsert = createItems.map((item) => ({
            ...item,
            ...foreignKeyMap,
          }));
          await client.insert(relay.targetTable as never).values(rowsToInsert as never);
        }

        if (itemsToSet && Array.isArray(itemsToSet) && itemsToSet.length > 0) {
          for (const item of itemsToSet) {
            const targetWhereConditions = Object.entries(item).map(([k, val]) =>
              eq((relay.targetTable as unknown as Record<string, unknown>)[k] as never, val)
            );
            if (targetWhereConditions.length > 0) {
              await client
                .update(relay.targetTable as never)
                .set(foreignKeyMap as never)
                .where(and(...targetWhereConditions));
            }
          }
        }
      }
    }
  }
}

interface QueryDataType {
  columns?: Record<string, boolean>;
  with?: Record<string, QueryDataType>;
  _name?: string;
}

export const replaceColumnValues = (
  tables: Record<string, ModelData>,
  tableName: string,
  tree: FieldTree,
  queryData: QueryDataType
): QueryDataType | { columns: Record<string, boolean>; extras: { _: SQL } } => {
  if (Object.keys(tree).every((v) => v === "__typename")) {
    return {
      columns: {},
      extras: { _: sql`0` },
    };
  }
  const info = tables[tableName]!;
  const columns = info?.columns;
  if (columns) {
    queryData.columns = Object.fromEntries(
      Object.entries(tree).flatMap(([name, value]) =>
        value === true && columns.find((v) => v.name === name) ? [[name, true]] : []
      )
    );
  }
  if (queryData.with) {
    Object.entries(queryData.with).forEach(([name, query]) => {
      if (typeof tree[name] === "object") {
        replaceColumnValues(tables, (query as { _name: string })._name, tree[name], query);
      }
    });
  }
  return queryData;
};

export const getReturning = (
  info: GraphQLResolveInfo,
  columns: Column[],
  primary?: boolean
): {
  isRelay: boolean;
  queryFields: FieldTree;
  returning: Record<string, Column> | undefined;
} => {
  const queryFields = getQueryFields(info);
  const isRelay = Object.keys(queryFields).some((v) => !columns.find((c) => c.name === v));
  const returningColumns = columns.filter(
    (v) => queryFields[v.name] || ((primary || isRelay) && v.primary)
  );
  if (!returningColumns.length) return { isRelay, queryFields, returning: undefined };
  const returning = Object.fromEntries(returningColumns.map((v) => [v.name, v]));
  return {
    isRelay,
    queryFields,
    returning,
  };
};
