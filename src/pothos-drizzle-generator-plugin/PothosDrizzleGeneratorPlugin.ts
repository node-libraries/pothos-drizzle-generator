/* eslint-disable @typescript-eslint/no-explicit-any */
import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import { sql } from "drizzle-orm";
import { PothosDrizzleGenerator } from "./generator";
import { convertAggregationQuery, createWhereQuery } from "./libs/utils";

export class PothosDrizzleGeneratorPlugin<
  Types extends SchemaTypes,
  T extends object = object
> extends BasePlugin<Types, T> {
  generator: PothosDrizzleGenerator;

  constructor(
    buildCache: BuildCache<Types>,
    name: keyof PothosSchemaTypes.Plugins<Types>
  ) {
    super(buildCache, name);
    this.generator = new PothosDrizzleGenerator(this.builder);
  }

  beforeBuild(): void {
    const generator = this.generator;

    const builder = this.builder;
    const tables = generator.getTables();
    for (const [modelName, { table, tableInfo, relations }] of Object.entries(
      tables
    )) {
      const objectRef = builder.objectRef(modelName);
      objectRef.implement({
        fields: (t) =>
          Object.fromEntries(
            tableInfo.columns.map((c) => {
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

      builder.drizzleObject(modelName as never, {
        name: tableInfo.name,
        fields: (t) => {
          const relayList = Object.entries(relations).map(
            ([relayName, relay]) => {
              const inputWhere = generator.getInputWhere(relay.targetTableName);
              const inputOrderBy = generator.getInputOrderBy(
                relay.targetTableName
              );
              return [
                relayName,
                t.relation(relayName, {
                  columns: { id: true },
                  args: {
                    offset: t.arg({ type: "Int" }),
                    limit: t.arg({ type: "Int" }),
                    where: t.arg({ type: inputWhere }),
                    orderBy: t.arg({ type: inputOrderBy }),
                  },
                  query: (args: {
                    where?: object;
                    offset?: number;
                    limit?: number;
                    orderBy?: object;
                  }) => {
                    return args;
                  },
                } as never),
              ];
            }
          );
          const relayCount = Object.entries(relations).map(
            ([relayName, relay]) => {
              const inputWhere = generator.getInputWhere(relay.targetTableName);
              return [
                `${relayName}Count`,
                t.relatedCount(relayName, {
                  args: { where: t.arg({ type: inputWhere }) },
                  where: (args: any) => args.where,
                } as never),
              ];
            }
          );
          return Object.fromEntries([
            ...relayCount,
            ...relayList,
            ...tableInfo.columns.map((c) => {
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
            resolve: async (query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any).query[
                modelName
              ].findMany(convertAggregationQuery(query(args)));
            },
          } as never),
        }),
      });
      builder.queryType({
        fields: (t) => ({
          [`findFirst${tableInfo.name}`]: t.drizzleField({
            type: modelName,
            args: {
              offset: t.arg({ type: "Int" }),
              where: t.arg({ type: inputWhere }),
              orderBy: t.arg({ type: inputOrderBy }),
            },
            resolve: async (query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any).query[
                modelName
              ].findFirst(convertAggregationQuery(query({ args })));
            },
          } as never),
        }),
      });
      builder.queryType({
        fields: (t) => ({
          [`count${tableInfo.name}`]: t.field({
            type: "Int",
            nullable: false,
            args: {
              limit: t.arg({ type: "Int" }),
              where: t.arg({ type: inputWhere }),
            },
            resolve: async (_query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any).query[modelName]
                .findFirst({
                  columns: {},
                  extras: { _count: () => sql`count(*)` },
                  ...args,
                })
                .then((v: any) => v._count);
            },
          } as never),
        }),
      });
      builder.mutationType({
        fields: (t) => ({
          [`createOne${tableInfo.name}`]: t.drizzleField({
            type: modelName,
            nullable: false,
            args: { input: t.arg({ type: inputCreate, required: true }) },
            resolve: async (_query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any)
                .insert(table)
                .values(args.input)
                .returning()
                .then((v: any) => v[0]);
            },
          } as never),
        }),
      });
      builder.mutationType({
        fields: (t) => ({
          [`createMany${tableInfo.name}`]: t.drizzleField({
            type: [modelName],
            nullable: false,
            args: { input: t.arg({ type: [inputCreate], required: true }) },
            resolve: async (_query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any)
                .insert(table)
                .values(args.input)
                .returning();
            },
          } as never),
        }),
      });
      builder.mutationType({
        fields: (t) => ({
          [`update${tableInfo.name}`]: t.drizzleField({
            type: [modelName],
            nullable: false,
            args: {
              input: t.arg({ type: inputUpdate, required: true }),
              where: t.arg({ type: inputWhere }),
            },
            resolve: async (_query: any, _parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any)
                .update(table)
                .set(args.input)
                .where(
                  args.where ? createWhereQuery(table, args.where) : undefined
                )
                .returning();
            },
          } as never),
        }),
      });
      builder.mutationType({
        fields: (t) => ({
          [`delete${tableInfo.name}`]: t.field({
            type: [modelName],
            nullable: false,
            args: {
              where: t.arg({ type: inputWhere }),
            },
            resolve: async (_parent: any, args: any, ctx: any) => {
              return (generator.getClient(ctx) as any)
                .delete(table)
                .where(
                  args.where ? createWhereQuery(table, args.where) : undefined
                )
                .returning();
            },
          } as never),
        }),
      });
    }
  }
}
