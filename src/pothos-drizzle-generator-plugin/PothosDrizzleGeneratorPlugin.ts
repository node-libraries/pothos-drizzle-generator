import { BasePlugin, type BuildCache, type SchemaTypes } from "@pothos/core";
import type { DrizzleClient } from "@pothos/plugin-drizzle";
import { isTable, sql, type RelationsRecord } from "drizzle-orm";
import type {
  PgArray,
  PgColumn,
  PgTable,
  getTableConfig,
} from "drizzle-orm/pg-core";
import { convertAggregationQuery, createInputOperator } from "./libs/utils";
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
  tables: Record<
    string,
    readonly [ReturnType<typeof getTableConfig>, RelationsRecord]
  > = {};

  constructor(
    buildCache: BuildCache<Types>,
    name: keyof PothosSchemaTypes.Plugins<Types>
  ) {
    super(buildCache, name);
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
          [name, [getConfig(table as PgTable), relations]] as const
      );

    this.tables = Object.fromEntries(tables);
    tables.forEach(([name, [table, relations]]) => {
      builder.drizzleObject(name as never, {
        name: table.name,
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
            ...table.columns.map((c) => {
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

      const inputWhere = this.getInputWhere(name);
      const inputOrderBy = this.getInputOrderBy(name);

      builder.queryType({
        fields: (t) => ({
          [`findMany${table.name}`]: t.drizzleField({
            type: [name],
            nullable: false,
            args: {
              offset: t.arg({ type: "Int" }),
              limit: t.arg({ type: "Int" }),
              where: t.arg({ type: inputWhere }),
              orderBy: t.arg({ type: inputOrderBy }),
            },
            resolve: async (query: any, _parent: any, args: any) => {
              return (client as any).query[name].findMany(
                convertAggregationQuery(query(args))
              );
            },
          } as never),
        }),
      });
      builder.queryType({
        fields: (t) => ({
          [`findFirst${table.name}`]: t.drizzleField({
            type: name,
            args: {
              offset: t.arg({ type: "Int" }),
              where: t.arg({ type: inputWhere }),
              orderBy: t.arg({ type: inputOrderBy }),
            },
            resolve: async (query: any, _parent: any, args: any) => {
              return (client as any).query[name].findFirst(
                convertAggregationQuery(query({ args }))
              );
            },
          } as never),
        }),
      });
      builder.queryType({
        fields: (t) => ({
          [`count${table.name}`]: t.field({
            type: "Int",
            nullable: false,
            args: {
              limit: t.arg({ type: "Int" }),
              where: t.arg({ type: inputWhere }),
            },
            resolve: async (_query: any, _parent: any, args: any) => {
              return (client as any).query[name]
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
    });
  }
  getInputWhere(tableName: string) {
    const i = this.inputWhere[tableName];
    if (i) return i;
    const [table] = this.tables[tableName];
    const inputWhere = this.builder.inputType(`${tableName}Input`, {
      fields: (t: any) => {
        return Object.fromEntries([
          ["AND", t.field({ type: [inputWhere] })],
          ["OR", t.field({ type: [inputWhere] })],
          ["NOT", t.field({ type: inputWhere })],
          ...table.columns.map((c: PgColumn) => {
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
    const [table] = this.tables[tableName];
    const inputOrderBy = this.builder.inputType(`${tableName}OrderBy`, {
      fields: (t: any) => {
        return Object.fromEntries(
          table.columns.map((c: PgColumn) => {
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
}
