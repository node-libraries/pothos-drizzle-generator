import { and, eq, sql, type Column, type RelationsRecord } from "drizzle-orm";
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

export function prepareQueryOptions(
  args: QueryArgs,
  params: ResolvedOperationParams,
  isMany: boolean
) {
  const where = {
    AND: [structuredClone(args.where), params.where].filter((v) => v),
  };

  const orderBy =
    args.orderBy && Object.keys(args.orderBy).length
      ? Object.fromEntries(args.orderBy.flatMap((v) => Object.entries(v)))
      : params.orderBy;

  const queryOptions: Omit<QueryArgs, "orderBy"> & { where: object; orderBy?: object } = {
    ...args,
    where,
    orderBy,
  };

  if (isMany) {
    queryOptions.limit =
      params.limit != null && args.limit != null
        ? Math.min(params.limit, args.limit)
        : (params.limit ?? args.limit);
  }

  return queryOptions;
}

export function separateInput(input: object, columns: Pick<Column, "name">[]) {
  const dbColumnsInput: Record<string, unknown> = {};
  const relationFieldsInput: [string, unknown][] = [];

  for (const [key, value] of Object.entries(input)) {
    if (columns.some((col) => col.name === key)) {
      dbColumnsInput[key] = value;
    } else {
      relationFieldsInput.push([key, value]);
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
      if (!itemsToSet || !relay?.through || !relay.throughTable) continue;

      const { throughTable } = relay;

      const sourceToThroughMap = Object.fromEntries(
        relay.sourceColumns.map((v, i) => [v.name, relay.through!.source[i]!._.key])
      );
      const targetToThroughMap = Object.fromEntries(
        relay.targetColumns.map((v, i) => [v.name, relay.through!.target[i]!._.key])
      );

      const sourceFilters = relay.sourceColumns.map(
        (v) => [sourceToThroughMap[v.name], result[v.name]] as const
      );
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
) => {
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

export const getReturning = (info: GraphQLResolveInfo, columns: Column[], primary?: boolean) => {
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
