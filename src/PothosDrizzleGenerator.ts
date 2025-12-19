/* eslint-disable @typescript-eslint/no-explicit-any */
import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleGenerator } from "./generator.js";
import { createWhereQuery, getQueryDepth } from "./libs/utils.js";
import type { GraphQLResolveInfo } from "graphql";

export class PothosDrizzleGenerator<
  Types extends SchemaTypes,
  T extends object = object
> extends BasePlugin<Types, T> {
  generator: DrizzleGenerator;

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
      const objectRef = builder.objectRef(`${tableInfo.name}_`);
      objectRef.implement({
        fields: (t) =>
          Object.fromEntries(
            columns.map((c) => {
              return [
                c.name,
                t.expose(
                  c.name as never,
                  {
                    type: generator.getDataType(c),
                    nullable: !c.notNull,
                  } as never
                ),
              ];
            })
          ),
      });
      const filterRelations = Object.entries(relations).filter(
        ([, relay]) => tables[relay.targetTableName]
      );
      builder.drizzleObject(modelName as never, {
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
                  ctx: any
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
                    pothosDrizzleSelect: (args: any, ctx: any) => {
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
                          [`${relayName}Count`]: (table: any) => {
                            const client: any = generator.getClient(ctx);
                            return client
                              .select({ count: sql`count(*)` })
                              .from(relay.targetTable)
                              .leftJoin(
                                relay.throughTable,
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
                                      table[v.name]
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
                  where: (args: any, ctx: any) => {
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
                query: any,
                _parent: any,
                args: any,
                ctx: any,
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

                return (generator.getClient(ctx) as any).query[
                  modelName
                ].findMany(
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
                query: any,
                _parent: any,
                args: any,
                ctx: any,
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
                return (generator.getClient(ctx) as any).query[
                  modelName
                ].findFirst(
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
                _query: any,
                _parent: any,
                args: any,
                ctx: any,
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
                  limit: limit?.({ modelName, ctx, operation }),
                  where: where?.({ modelName, ctx, operation }),
                };
                if (
                  p.depthLimit !== undefined &&
                  getQueryDepth(info) > p.depthLimit
                )
                  throw new Error("Depth limit exceeded");
                return (generator.getClient(ctx) as any).query[modelName]
                  .findFirst({
                    columns: {},
                    extras: { _count: () => sql`count(*)` },
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
                  })
                  .then((v: any) => v._count);
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
                _query: any,
                _parent: any,
                args: any,
                ctx: any,
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
                return (generator.getClient(ctx) as any)
                  .insert(table)
                  .values({ ...args.input, ...p.input })
                  .returning()
                  .then((v: any) => v[0]);
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
                _query: any,
                _parent: any,
                args: any,
                ctx: any,
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
                return (generator.getClient(ctx) as any)
                  .insert(table)
                  .values(args.input.map((v: any) => ({ ...v, ...p.args })))
                  .returning();
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
                _query: any,
                _parent: any,
                args: any,
                ctx: any,
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
                return (generator.getClient(ctx) as any)
                  .update(table)
                  .set(args.input)
                  .where(
                    createWhereQuery(table, {
                      AND: [structuredClone(args.where), p.where].filter(
                        (v) => v
                      ),
                    } as never)
                  )
                  .returning();
              },
            } as never),
          }),
        });
      }
      if (operations.includes("delete")) {
        builder.mutationType({
          fields: (t) => ({
            [`delete${tableInfo.name}`]: t.field({
              type: [`${tableInfo.name}_`],
              nullable: false,
              args: {
                where: t.arg({ type: inputWhere }),
              },
              resolve: async (
                _parent: any,
                args: any,
                ctx: any,
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
                return (generator.getClient(ctx) as any)
                  .delete(table)
                  .where(
                    createWhereQuery(table, {
                      AND: [structuredClone(args.where), p.where].filter(
                        (v) => v
                      ),
                    } as never)
                  )
                  .returning();
              },
            } as never),
          }),
        });
      }
    }
  }
}
