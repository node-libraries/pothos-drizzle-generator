import { and, eq, type Column, type RelationsRecord } from "drizzle-orm";
import {
  getReturning,
  type ModelData,
  DrizzleGenerator,
  replaceColumnValues,
  type DbClient,
} from "../generator.js";
import { createWhereQuery } from "../libs/drizzle.js";
import { getQueryFields } from "../libs/graphql.js";
import { checkPermissionsAndGetParams } from "../libs/permissions.js";
import type { SchemaTypes } from "@pothos/core";
import type { GraphQLResolveInfo } from "graphql";

function separateInput(input: object, columns: Pick<Column, "name">[]) {
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

export function defineCreateOne<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData
) {
  const { tableInfo, columns, table, relations } = modelData;
  const inputCreate = generator.getInputCreate(modelName);

  builder.mutationType({
    fields: (t) => ({
      [`createOne${tableInfo.name}`]: t.drizzleField({
        type: modelName,
        nullable: false,
        args: { input: t.arg({ type: inputCreate, required: true }) },
        resolve: async (
          query: (selection: unknown) => unknown,
          _parent: unknown,
          args: { input: object },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const client = generator.getClient(ctx);
          const params = checkPermissionsAndGetParams(modelName, "createOne", ctx, info, modelData);
          const combinedInput = { ...args.input, ...params.input };
          const { dbColumnsInput, relationFieldsInput } = separateInput(combinedInput, columns);
          const hasRelationInput = relationFieldsInput.length > 0;
          const { returning, isRelay } = getReturning(info, columns, hasRelationInput);
          if (!isRelay) {
            query({});
          }
          if (!returning) {
            return client
              .insert(table as never)
              .values(dbColumnsInput as never)
              .then(() => ({}));
          }

          return client.transaction(async (tx) =>
            tx
              .insert(table as never)
              .values(dbColumnsInput as never)
              .returning(returning)
              .then(async (results) => {
                if (hasRelationInput) {
                  await insertRelayValue({
                    results,
                    client: tx,
                    relationInputs: [relationFieldsInput],
                    relations,
                  });
                }
                return results[0];
              })
          );
        },
      } as never),
    }),
  });
}

export function defineCreateMany<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData
) {
  const { tableInfo, columns, table, relations } = modelData;
  const inputCreate = generator.getInputCreate(modelName);

  builder.mutationType({
    fields: (t) => ({
      [`createMany${tableInfo.name}`]: t.drizzleField({
        type: [modelName],
        nullable: false,
        args: { input: t.arg({ type: [inputCreate], required: true }) },
        resolve: async (
          query: (selection: unknown) => object,
          _parent: unknown,
          args: { input: object[] },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const client = generator.getClient(ctx);
          const params = checkPermissionsAndGetParams(
            modelName,
            "createMany",
            ctx,
            info,
            modelData
          );
          if (!args.input.length) return [];
          const combinedInputs = args.input.map((v) => ({
            ...v,
            ...params.input,
          }));
          const separatedInputs = combinedInputs.map((input) => separateInput(input, columns));
          const dbColumnsInputs = separatedInputs.map((i) => i.dbColumnsInput);
          const relationFieldsInputs = separatedInputs.map((i) => i.relationFieldsInput);

          const hasRelationInput = relationFieldsInputs.some((v) => v.length > 0);
          const { returning, isRelay } = getReturning(info, columns, hasRelationInput);

          if (!isRelay) {
            query({});
          }
          if (!returning) {
            return client
              .insert(table as never)
              .values(dbColumnsInputs as never)
              .then((v) => Array("rowCount" in v ? v.rowCount : v.rowsAffected).fill({}));
          }
          return client.transaction(async (tx) =>
            tx
              .insert(table as never)
              .values(dbColumnsInputs as never)
              .returning(returning)
              .then(async (results) => {
                if (hasRelationInput) {
                  await insertRelayValue({
                    results,
                    client: tx,
                    relationInputs: relationFieldsInputs,
                    relations,
                  });
                }
                return results;
              })
          );
        },
      } as never),
    }),
  });
}

export function defineUpdate<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData
) {
  const { tableInfo, columns, table, relations } = modelData;
  const inputUpdate = generator.getInputUpdate(modelName);
  const inputWhere = generator.getInputWhere(modelName);

  builder.mutationType({
    fields: (t) => ({
      [`update${tableInfo.name}`]: t.drizzleField({
        type: [modelName],
        nullable: false,
        args: {
          input: t.arg({ type: inputUpdate, required: true }),
          where: t.arg({ type: inputWhere }),
        },
        resolve: async (
          query: (selection: unknown) => object,
          _parent: unknown,
          args: { input: object; where?: object },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const client = generator.getClient(ctx);
          const params = checkPermissionsAndGetParams(modelName, "update", ctx, info, modelData);
          const combinedInput = { ...args.input, ...params.input };
          const { dbColumnsInput, relationFieldsInput } = separateInput(combinedInput, columns);
          const hasRelationInput = relationFieldsInput.length > 0;
          const { returning, isRelay } = getReturning(info, columns, hasRelationInput);

          if (!isRelay) {
            query({});
          }
          const whereQuery = createWhereQuery(table, {
            AND: [structuredClone(args.where), params.where].filter((v) => v),
          } as never);

          if (!returning) {
            return client
              .update(table as never)
              .set(dbColumnsInput as never)
              .where(whereQuery)
              .then((v) => Array("rowCount" in v ? v.rowCount : v.rowsAffected).fill({}));
          }

          return client.transaction(async (tx) =>
            tx
              .update(table as never)
              .set(dbColumnsInput as never)
              .where(whereQuery)
              .returning(returning)
              .then(async (results) => {
                if (hasRelationInput) {
                  await insertRelayValue({
                    results,
                    client: tx,
                    relationInputs: Array(results.length).fill(relationFieldsInput),
                    relations,
                  });
                }
                return results;
              })
          );
        },
      } as never),
    }),
  });
}

export function defineDelete<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData,
  tables: Record<string, ModelData>
) {
  const { tableInfo, columns, table } = modelData;
  const inputWhere = generator.getInputWhere(modelName);

  builder.mutationType({
    fields: (t) => ({
      [`delete${tableInfo.name}`]: t.drizzleField({
        type: [modelName],
        nullable: false,
        args: { where: t.arg({ type: inputWhere }) },
        resolve: async (
          query: (selection: unknown) => object,
          _parent: unknown,
          args: { where?: object },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const params = checkPermissionsAndGetParams(modelName, "delete", ctx, info, modelData);
          const { returning, isRelay } = getReturning(info, columns);
          const whereCondition = {
            AND: [structuredClone(args.where), params.where].filter((v) => v),
          };

          if (isRelay) {
            const result = await generator
              .getQueryTable(ctx, modelName)
              .findMany(
                replaceColumnValues(
                  tables,
                  modelName,
                  getQueryFields(info),
                  query({ ...args, where: whereCondition })
                ) as never
              );
            await generator
              .getClient(ctx)
              .delete(table as never)
              .where(createWhereQuery(table, whereCondition as never));
            return result;
          }

          query({});
          const whereQuery = createWhereQuery(table, whereCondition as never);

          return returning
            ? generator
                .getClient(ctx)
                .delete(table as never)
                .where(whereQuery)
                .returning(returning)
            : generator
                .getClient(ctx)
                .delete(table as never)
                .where(whereQuery)
                .then((v) => Array("rowCount" in v ? v.rowCount : v.rowsAffected).fill({}));
        },
      } as never),
    }),
  });
}

async function insertRelayValue({
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
