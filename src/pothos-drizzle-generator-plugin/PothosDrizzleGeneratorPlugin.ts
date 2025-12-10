import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import type { DrizzleClient } from "@pothos/plugin-drizzle";
import {
  isTable,
  sql,
  type RelationsRecord,
  type SchemaEntry,
} from "drizzle-orm";
import type {
  PgArray,
  PgColumn,
  PgTable,
  getTableConfig,
} from "drizzle-orm/pg-core";
import {
  convertAggregationQuery,
  createInputOperator,
  createWhereQuery,
  getQueryFields,
} from "./libs/utils";
import {
  BigIntResolver,
  ByteResolver,
  DateResolver,
  DateTimeResolver,
  HexadecimalResolver,
  JSONResolver,
} from "graphql-scalars";

export class PothosDrizzleGeneratorPlugin<
  Types extends SchemaTypes,
  T extends object = object
> extends BasePlugin<Types, T> {
  enums: Record<string, PothosSchemaTypes.EnumRef<any, any>> = {};
  inputOperators: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> =
    {};
  inputWhere: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> = {};
  inputOrderBy: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> = {};
  inputCreate: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> = {};
  inputUpdate: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> = {};
  tables: Record<
    string,
    readonly [SchemaEntry, ReturnType<typeof getTableConfig>, RelationsRecord]
  > = {};

  constructor(
    buildCache: BuildCache<Types>,
    name: keyof PothosSchemaTypes.Plugins<Types>
  ) {
    super(buildCache, name);
  }
  getInputCreate(tableName: string) {
    const i = this.inputCreate[tableName];
    if (i) return i;
    const [, tableInfo] = this.tables[tableName];
    const inputArgs = this.builder.inputType(`${tableName}InputCreate`, {
      fields: (t: any) => {
        return Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => {
            return [
              c.name,
              t.field({
                type: this.getDataType(c),
                required: c.notNull && !c.default,
              }),
            ];
          })
        );
      },
    } as never);
    this.inputCreate[tableName] = inputArgs;
    return inputArgs;
  }
  getInputUpdate(tableName: string) {
    const i = this.inputUpdate[tableName];
    if (i) return i;
    const [, tableInfo] = this.tables[tableName];
    const inputUpdate = this.builder.inputType(`${tableName}InputUpdate`, {
      fields: (t: any) => {
        return Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => {
            return [
              c.name,
              t.field({
                type: this.getDataType(c),
              }),
            ];
          })
        );
      },
    } as never);
    this.inputUpdate[tableName] = inputUpdate;
    return inputUpdate;
  }
  getInputWhere(tableName: string) {
    const i = this.inputWhere[tableName];
    if (i) return i;
    const [, tableInfo] = this.tables[tableName];
    const inputWhere = this.builder.inputType(`${tableName}InputWhere`, {
      fields: (t: any) => {
        return Object.fromEntries([
          ["AND", t.field({ type: [inputWhere] })],
          ["OR", t.field({ type: [inputWhere] })],
          ["NOT", t.field({ type: inputWhere })],
          ...tableInfo.columns.map((c: PgColumn) => {
            return [
              c.name,
              t.field({
                type: this.getInputOperator(this.getDataType(c)),
              }),
            ];
          }),
        ]);
      },
    } as never);
    this.inputWhere[tableName] = inputWhere;
    return inputWhere;
  }
  getInputOrderBy(tableName: string) {
    const i = this.inputOrderBy[tableName];
    if (i) return i;
    const [, tableInfo] = this.tables[tableName];
    const inputOrderBy = this.builder.inputType(`${tableName}OrderBy`, {
      fields: (t: any) => {
        return Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => {
            return [
              c.name,
              t.field({
                type: this.enums["OrderBy"],
              }),
            ];
          })
        );
      },
    } as never);
    this.inputOrderBy[tableName] = inputOrderBy;
    return inputOrderBy;
  }
  getInputOperator(type: string | [string]) {
    const typeName = Array.isArray(type) ? `Array${type[0]}` : type;
    const input =
      this.inputOperators[typeName] ?? createInputOperator(this.builder, type);
    this.inputOperators[typeName] = input;
    return input;
  }
  createInputType() {
    const builder = this.builder;
    builder.addScalarType("BigInt" as never, BigIntResolver, {});
    builder.addScalarType("Bytes" as never, ByteResolver, {});
    builder.addScalarType("Date" as never, DateResolver, {});
    builder.addScalarType("DateTime" as never, DateTimeResolver, {});
    builder.addScalarType("Json" as never, JSONResolver, {});
    builder.addScalarType("Decimal" as never, HexadecimalResolver, {});

    this.enums["OrderBy"] = builder.enumType("OrderBy", {
      values: {
        Asc: { value: "asc" },
        Desc: { value: "desc" },
      },
    });
  }
  getDataType(column: PgColumn): string | [string] {
    const isArray = column.dataType.split(" ")[0] === "array";
    const c = isArray ? (column as PgArray<any, any>).baseColumn : column;
    const types = c.dataType.split(" ");

    switch (types[1] ?? types[0]) {
      case "enum":
        const sqlType = c.getSQLType();
        const e = this.enums[sqlType];
        if (!e) {
          this.enums[sqlType] = this.builder.enumType(sqlType, {
            values: c.enumValues ?? [],
          });
        }
        return isArray ? [sqlType] : sqlType;
      case "json":
        return isArray ? ["Json"] : "Json";
      case "date":
        return isArray ? ["DateTime"] : "DateTime";
      case "datetime":
        return isArray ? ["DateTime"] : "DateTime";
      case "boolean":
        return isArray ? ["Boolean"] : "Boolean";
      case "double":
      case "float":
      case "udouble":
      case "ufloat":
        return isArray ? ["Float"] : "Float";
    }
    const type = isArray ? types[1] : types[0];
    const scalerMap: Record<string, string> = {
      bigint: "BigInt",
      number: "Float",
      string: "String",
    };
    const result = scalerMap[type] ?? "String";
    return isArray ? [result] : result;
  }

  beforeBuild(): void {
    this.createInputType();
    const builder = this.builder;
    const drizzleOption = builder.options.drizzle;
    const client = drizzleOption.client as DrizzleClient;
    const getConfig: typeof getTableConfig =
      drizzleOption.getTableConfig as typeof getTableConfig;
    const relations = drizzleOption.relations ?? client._.relations;
    const tables = Object.values(relations)
      .filter((t) => isTable(t.table))
      .map(
        ({ name, table, relations }) =>
          [name, [table, getConfig(table as PgTable), relations]] as const
      );

    this.tables = Object.fromEntries(tables);
    tables.forEach(([modelName, [table, tableInfo, relations]]) => {
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
                    type: this.getDataType(c),
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
              const inputWhere = this.getInputWhere(relay.targetTableName);
              const inputOrderBy = this.getInputOrderBy(relay.targetTableName);
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
          // const relayCount = Object.entries(relations).map(
          //   ([relayName, relay]) => {
          //     const inputWhere = this.getInputWhere(relay.targetTableName);
          //     return [
          //       `${relayName}Count`,
          //       t.field({
          //         type: "Int",
          //         nullable: false,
          //         args: {
          //           offset: t.arg({ type: "Int" }),
          //           limit: t.arg({ type: "Int" }),
          //           where: t.arg({ type: inputWhere }),
          //         },
          //         extensions: {
          //           pothosDrizzleSelect: (args: any) => ({
          //             with: {
          //               [relayName]: {
          //                 aggregation: true,
          //                 columns: {},
          //                 extras: {
          //                   _count: () => sql`count(*)`,
          //                 },
          //                 ...args,
          //               },
          //             },
          //           }),
          //         },
          //         resolve: (parent: any) => {
          //           return parent[relayName][0]["_count"];
          //         },
          //       }),
          //     ];
          //   }
          // );
          return Object.fromEntries([
            // ...relayCount,
            ...relayList,
            ...tableInfo.columns.map((c) => {
              return [
                c.name,
                t.expose(c.name, {
                  type: this.getDataType(c),
                  nullable: !c.notNull,
                } as never),
              ];
            }),
          ]);
        },
      });

      const inputWhere = this.getInputWhere(modelName);
      const inputOrderBy = this.getInputOrderBy(modelName);
      const inputCreate = this.getInputCreate(modelName);
      const inputUpdate = this.getInputUpdate(modelName);
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
              info: any
            ) => {
              return (client as any).query[modelName].findMany(
                convertAggregationQuery(query(args))
              );
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
            resolve: async (query: any, _parent: any, args: any) => {
              return (client as any).query[modelName].findFirst(
                convertAggregationQuery(query({ args }))
              );
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
            resolve: async (_query: any, _parent: any, args: any) => {
              return (client as any).query[modelName]
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
            resolve: async (_query: any, _parent: any, args: any) => {
              return (client as any)
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
            resolve: async (_query: any, _parent: any, args: any) => {
              return (client as any)
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
            resolve: async (_query: any, _parent: any, args: any) => {
              return (client as any)
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
            resolve: async (_parent: any, args: any) => {
              return (client as any)
                .delete(table)
                .where(
                  args.where ? createWhereQuery(table, args.where) : undefined
                )
                .returning();
            },
          } as never),
        }),
      });
    });
  }
}
