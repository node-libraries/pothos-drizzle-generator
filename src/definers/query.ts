import { sql } from "drizzle-orm";
import { replaceColumnValues, type ModelData, DrizzleGenerator } from "../generator.js";
import { checkPermissionsAndGetParams } from "../libs/utils.js";
import { getQueryFields } from "../libs/utils.js";
import type { SchemaTypes } from "@pothos/core";
import type { GraphQLResolveInfo } from "graphql";

export function defineFindMany<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData,
  tables: Record<string, ModelData>
) {
  const { tableInfo } = modelData;
  const inputWhere = generator.getInputWhere(modelName);
  const inputOrderBy = generator.getInputOrderBy(modelName);

  builder.queryType({
    fields: (t) => ({
      [`findMany${tableInfo.name}`]: t.drizzleField({
        type: [modelName],
        nullable: false,
        args: {
          offset: t.arg({ type: "Int" }),
          limit: t.arg({ type: "Int" }),
          where: t.arg({ type: inputWhere }),
          orderBy: t.arg({ type: [inputOrderBy] }),
        },
        resolve: async (
          query: (selection: unknown) => object,
          _parent: unknown,
          args: { limit?: number; where: object; orderBy?: object[] },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const params = checkPermissionsAndGetParams(modelName, "findMany", ctx, info, modelData);

          return generator.getQueryTable(ctx, modelName).findMany(
            replaceColumnValues(
              tables,
              modelName,
              getQueryFields(info),
              query({
                ...args,
                limit:
                  params.limit && args.limit
                    ? Math.min(params.limit, args.limit)
                    : (params.limit ?? args.limit),
                where: {
                  AND: [structuredClone(args.where), params.where].filter((v) => v),
                },
                orderBy:
                  args.orderBy && Object.keys(args.orderBy).length
                    ? Object.fromEntries(args.orderBy.flatMap((v) => Object.entries(v)))
                    : params.orderBy,
              })
            ) as never
          );
        },
      } as never),
    }),
  });
}

export function defineFindFirst<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData,
  tables: Record<string, ModelData>
) {
  const { tableInfo } = modelData;
  const inputWhere = generator.getInputWhere(modelName);
  const inputOrderBy = generator.getInputOrderBy(modelName);

  builder.queryType({
    fields: (t) => ({
      [`findFirst${tableInfo.name}`]: t.drizzleField({
        type: modelName,
        args: {
          offset: t.arg({ type: "Int" }),
          where: t.arg({ type: inputWhere }),
          orderBy: t.arg({ type: [inputOrderBy] }),
        },
        resolve: async (
          query: (selection: unknown) => object,
          _parent: unknown,
          args: { where: object; orderBy?: object[] },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const params = checkPermissionsAndGetParams(modelName, "findFirst", ctx, info, modelData);

          return generator.getQueryTable(ctx, modelName).findFirst(
            replaceColumnValues(
              tables,
              modelName,
              getQueryFields(info),
              query({
                ...args,
                where: {
                  AND: [structuredClone(args.where), params.where].filter((v) => v),
                },
                orderBy:
                  args.orderBy && Object.keys(args.orderBy).length
                    ? Object.fromEntries(args.orderBy.flatMap((v) => Object.entries(v)))
                    : params.orderBy,
              })
            ) as never
          );
        },
      } as never),
    }),
  });
}

export function defineCount<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData
) {
  const { tableInfo } = modelData;
  const inputWhere = generator.getInputWhere(modelName);

  builder.queryType({
    fields: (t) => ({
      [`count${tableInfo.name}`]: t.field({
        type: "Int",
        nullable: false,
        args: {
          limit: t.arg({ type: "Int" }),
          where: t.arg({ type: inputWhere }),
        },
        resolve: async (
          _parent: unknown,
          args: { where?: object },
          ctx: object,
          info: GraphQLResolveInfo
        ) => {
          const params = checkPermissionsAndGetParams(modelName, "count", ctx, info, modelData);

          return generator
            .getQueryTable(ctx, modelName)
            .findFirst({
              columns: {},
              extras: { _count: () => sql`count(*) ` },
              ...args,
              where: {
                AND: [structuredClone(args.where), params.where].filter((v) => v),
              },
            } as never)
            .then((v: unknown) => (v as { _count: number })._count);
        },
      } as never),
    }),
  });
}
