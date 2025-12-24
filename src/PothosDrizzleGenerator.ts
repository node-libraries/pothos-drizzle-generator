import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import { and, eq, sql } from "drizzle-orm";
import {
  DrizzleGenerator,
  getReturning,
  replaceColumnValues,
} from "./generator.js";
import {
  createWhereQuery,
  getQueryDepth,
  getQueryFields,
} from "./libs/utils.js";
import type { DrizzleObjectRef } from "@pothos/plugin-drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import type { RelationalQueryBuilder } from "drizzle-orm/pg-core/query-builders/query";
import type { GraphQLResolveInfo } from "graphql";

export class PothosDrizzleGenerator<
  Types extends SchemaTypes,
  T extends object = object
> extends BasePlugin<Types, T> {
  generator: DrizzleGenerator<Types>;

  constructor(
    buildCache: BuildCache<Types>,
    name: keyof PothosSchemaTypes.Plugins<Types>
  ) {
    super(buildCache, name);
    this.generator = new DrizzleGenerator(this.builder);
  }

  beforeBuild(): void {
    const generator = this.generator;

    const builder = this.builder;
    const tables = generator.getTables();
    const modelObjects: Record<string, DrizzleObjectRef<Types>> = {};
    for (const [
      modelName,
      {
        table,
        tableInfo,
        relations,
        columns,
        operations,
        executable,
        limit,
        where,
        orderBy,
        inputData,
        depthLimit,
      },
    ] of Object.entries(tables)) {
      const filterRelations = Object.entries(relations).filter(
        ([, relay]) => tables[relay.targetTableName]
      );
      modelObjects[modelName] = builder.drizzleObject(modelName as never, {
        name: tableInfo.name,
        fields: (t) => {
          const relayList = filterRelations.map(([relayName, relay]) => {
            const modelName = relay.targetTableName;
            const { executable, where, orderBy, limit, operations } =
              tables[modelName]!;
            const operation =
              relay.relationType === "one" ? "findFirst" : "findMany";
            if (!operations.includes(operation)) return [];
            const inputWhere = generator.getInputWhere(modelName);
            const inputOrderBy = generator.getInputOrderBy(modelName);
            return [
              relayName,
              t.relation(relayName, {
                nullable: relay.relationType === "one",
                args: {
                  offset: t.arg({ type: "Int" }),
                  limit: t.arg({ type: "Int" }),
                  where: t.arg({ type: inputWhere }),
                  orderBy: t.arg({ type: inputOrderBy }),
                },
                query: (
                  args: {
                    where?: object;
                    offset?: number;
                    limit?: number;
                    orderBy?: object;
                  },
                  ctx: object
                ) => {
                  if (
                    executable?.({
                      modelName,
                      ctx,
                      operation,
                    }) === false
                  ) {
                    throw new Error("No permission");
                  }
                  const p = {
                    limit: limit?.({ modelName, ctx, operation }),
                    where: where?.({ modelName, ctx, operation }),
                    orderBy: orderBy?.({ modelName, ctx, operation }),
                  };
                  return {
                    ...args,
                    _name: modelName,
                    limit:
                      p.limit && args.limit
                        ? Math.min(p.limit, args.limit)
                        : p.limit ?? args.limit,
                    where: {
                      AND: [structuredClone(args.where), p.where].filter(
                        (v) => v
                      ),
                    },
                    orderBy:
                      args.orderBy && Object.keys(args.orderBy).length
                        ? args.orderBy
                        : p.orderBy,
                  };
                },
              } as never),
            ];
          });
          const relayCount = filterRelations.map(([relayName, relay]) => {
            const modelName = relay.targetTableName;
            const operation = "count";
            const { executable, where, operations } = tables[modelName]!;
            if (!operations.includes(operation)) return [];
            const inputWhere = generator.getInputWhere(modelName);
            if (relay.throughTable) {
              return [
                `${relayName}Count`,
                t.field({
                  type: "Int",
                  nullable: false,
                  args: { where: t.arg({ type: inputWhere }) },
                  extensions: {
                    pothosDrizzleSelect: (
                      args: { where?: object },
                      ctx: object
                    ) => {
                      if (
                        executable?.({
                          modelName,
                          ctx,
                          operation,
                        }) === false
                      ) {
                        throw new Error("No permission");
                      }
                      const p = {
                        where: where?.({
                          modelName,
                          ctx,
                          operation,
                        }),
                      };
                      return {
                        columns: {},
                        extras: {
                          [`${relayName}Count`]: (table: PgTable) => {
                            const client: NodePgDatabase =
                              generator.getClient(ctx);
                            return client
                              .select({ count: sql`count(*)` })
                              .from(relay.targetTable as never)
                              .leftJoin(
                                relay.throughTable as never,
                                and(
                                  ...relay.targetColumns.map((v, index) =>
                                    eq(
                                      relay.through!.target[index]!._.column,
                                      v
                                    )
                                  )
                                )
                              )
                              .where(
                                and(
                                  ...relay.sourceColumns.map((v, index) =>
                                    eq(
                                      relay.through!.source[index]!._.column,
                                      table[v.name as keyof typeof table]
                                    )
                                  ),
                                  createWhereQuery(relay.targetTable, {
                                    AND: [
                                      structuredClone(args.where),
                                      p.where,
                                    ].filter((v) => v),
                                  } as never)
                                )
                              );
                          },
                        },
                      };
                    },
                  },
                } as never),
              ];
            } else {
              return [
                `${relayName}Count`,
                t.relatedCount(relayName, {
                  args: { where: t.arg({ type: inputWhere }) },
                  where: (
                    args: { limit?: number; where?: object },
                    ctx: object
                  ) => {
                    if (
                      executable?.({
                        modelName,
                        ctx,
                        operation,
                      }) === false
                    ) {
                      throw new Error("No permission");
                    }
                    const p = {
                      where: where?.({ modelName, ctx, operation }),
                    };
                    return createWhereQuery(relay.targetTable, {
                      AND: [structuredClone(args.where), p.where].filter(
                        (v) => v
                      ),
                    } as never);
                  },
                } as never),
              ];
            }
          });

          return Object.fromEntries([
            ...relayCount,
            ...relayList,
            ...columns.map((c) => {
              return [
                c.name,
                t.expose(c.name, {
                  type: generator.getDataType(c),
                  nullable: !c.notNull,
                } as never),
              ];
            }),
          ]);
        },
      });

      const inputWhere = generator.getInputWhere(modelName);
      const inputOrderBy = generator.getInputOrderBy(modelName);
      const inputCreate = generator.getInputCreate(modelName);
      const inputUpdate = generator.getInputUpdate(modelName);
      if (operations.includes("findMany")) {
        builder.queryType({
          fields: (t) => ({
            [`findMany${tableInfo.name}`]: t.drizzleField({
              type: [modelName],
              nullable: false,
              args: {
                offset: t.arg({ type: "Int" }),
                limit: t.arg({ type: "Int" }),
                where: t.arg({ type: inputWhere }),
                orderBy: t.arg({ type: inputOrderBy }),
              },
              resolve: async (
                query: (selection: unknown) => object,
                _parent: unknown,
                args: { limit?: number; where: object; orderBy?: object },
                ctx: object,
                info: GraphQLResolveInfo
              ) => {
                const operation = "findMany";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  limit: limit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                  orderBy: orderBy?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");

                return generator.getQueryTable(ctx, modelName).findMany(
                  replaceColumnValues(
                    tables,
                    modelName,
                    getQueryFields(info),
                    query({
                      ...args,
                      limit:
                        p.limit && args.limit
                          ? Math.min(p.limit, args.limit)
                          : p.limit ?? args.limit,
                      where: {
                        AND: [structuredClone(args.where), p.where].filter(
                          (v) => v
                        ),
                      },
                      orderBy:
                        args.orderBy && Object.keys(args.orderBy).length
                          ? args.orderBy
                          : p.orderBy,
                    })
                  ) as never
                );
              },
            } as never),
          }),
        });
      }
      if (operations.includes("findFirst")) {
        builder.queryType({
          fields: (t) => ({
            [`findFirst${tableInfo.name}`]: t.drizzleField({
              type: modelName,
              args: {
                offset: t.arg({ type: "Int" }),
                where: t.arg({ type: inputWhere }),
                orderBy: t.arg({ type: inputOrderBy }),
              },
              resolve: async (
                query: (selection: unknown) => object,
                _parent: unknown,
                args: {
                  limit?: number;
                  where: object;
                  orderBy?: object;
                  offset?: number;
                },
                ctx: object,
                info: GraphQLResolveInfo
              ) => {
                const operation = "findFirst";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                  orderBy: orderBy?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                return generator.getQueryTable(ctx, modelName).findFirst(
                  replaceColumnValues(
                    tables,
                    modelName,
                    getQueryFields(info),
                    query({
                      ...args,
                      where: {
                        AND: [structuredClone(args.where), p.where].filter(
                          (v) => v
                        ),
                      },
                      orderBy:
                        args.orderBy && Object.keys(args.orderBy).length
                          ? args.orderBy
                          : p.orderBy,
                    })
                  ) as never
                );
              },
            } as never),
          }),
        });
      }
      if (operations.includes("count")) {
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
                args: { limit?: number; where?: object },
                ctx: object,
                info: GraphQLResolveInfo
              ) => {
                const operation = "count";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }

                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                return (
                  generator.getClient(ctx).query[
                    modelName as never
                  ] as RelationalQueryBuilder<never, never>
                )
                  .findFirst({
                    columns: {},
                    extras: { _count: () => sql`count(*) ` },
                    ...args,
                    where: {
                      AND: [structuredClone(args.where), p.where].filter(
                        (v) => v
                      ),
                    },
                  } as never)
                  .then((v: unknown) => (v as { _count: number })._count);
              },
            } as never),
          }),
        });
      }
      if (operations.includes("createOne")) {
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
                const operation = "createOne";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  input: inputData?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                query({});
                const returning = getReturning(info, columns);
                return returning
                  ? generator
                      .getClient(ctx)
                      .insert(table as never)
                      .values({ ...args.input, ...p.input })
                      .returning(returning)
                      .then((v: object[]) => v[0])
                  : generator
                      .getClient(ctx)
                      .insert(table as never)
                      .values({ ...args.input, ...p.input })
                      .then(() => ({}));
              },
            } as never),
          }),
        });
      }
      if (operations.includes("createMany")) {
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
                const operation = "createMany";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  args: inputData?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                if (!args.input.length) return [];
                query({});
                const returning = getReturning(info, columns);
                return returning
                  ? generator
                      .getClient(ctx)
                      .insert(table as never)
                      .values(args.input.map((v) => ({ ...v, ...p.args })))
                      .returning(returning)
                  : generator
                      .getClient(ctx)
                      .insert(table as never)
                      .values(args.input.map((v) => ({ ...v, ...p.args })))
                      .then((v) => Array(v.rowCount ?? 0).fill({}));
              },
            } as never),
          }),
        });
      }
      if (operations.includes("update")) {
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
                args: {
                  input: object;
                  where?: object;
                },
                ctx: object,
                info: GraphQLResolveInfo
              ) => {
                const operation = "update";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                query({});
                const returning = getReturning(info, columns);
                return returning
                  ? generator
                      .getClient(ctx)
                      .update(table as never)
                      .set(args.input)
                      .where(
                        createWhereQuery(table, {
                          AND: [structuredClone(args.where), p.where].filter(
                            (v) => v
                          ),
                        } as never)
                      )
                      .returning(returning)
                  : generator
                      .getClient(ctx)
                      .update(table as never)
                      .set(args.input)
                      .where(
                        createWhereQuery(table, {
                          AND: [structuredClone(args.where), p.where].filter(
                            (v) => v
                          ),
                        } as never)
                      )
                      .then((v) => Array(v.rowCount ?? 0).fill({}));
              },
            } as never),
          }),
        });
      }
      if (operations.includes("delete")) {
        builder.mutationType({
          fields: (t) => ({
            [`delete${tableInfo.name}`]: t.drizzleField({
              type: [modelName],
              nullable: false,
              args: {
                where: t.arg({ type: inputWhere }),
              },
              resolve: async (
                query: (selection: unknown) => object,
                _parent: unknown,
                args: { where?: object },
                ctx: object,
                info: GraphQLResolveInfo
              ) => {
                const operation = "delete";
                if (
                  executable?.({
                    modelName,
                    ctx,
                    operation,
                  }) === false
                ) {
                  throw new Error("No permission");
                }
                const p = {
                  depthLimit: depthLimit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                query({});
                const returning = getReturning(info, columns);
                return returning
                  ? generator
                      .getClient(ctx)
                      .delete(table as never)
                      .where(
                        createWhereQuery(table, {
                          AND: [structuredClone(args.where), p.where].filter(
                            (v) => v
                          ),
                        } as never)
                      )
                      .returning(returning)
                  : generator
                      .getClient(ctx)
                      .delete(table as never)
                      .where(
                        createWhereQuery(table, {
                          AND: [structuredClone(args.where), p.where].filter(
                            (v) => v
                          ),
                        } as never)
                      )
                      .then((v) => Array(v.rowCount ?? 0).fill({}));
              },
            } as never),
          }),
        });
      }
    }
  }
}
