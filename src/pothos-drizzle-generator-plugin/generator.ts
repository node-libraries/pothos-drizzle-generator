/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  isTable,
  type AnyRelations,
  type RelationsRecord,
  type SchemaEntry,
} from "drizzle-orm";
import {
  BigIntResolver,
  ByteResolver,
  DateResolver,
  DateTimeResolver,
  HexadecimalResolver,
  JSONResolver,
} from "graphql-scalars";
import { createInputOperator } from "./libs/utils";
import type { DrizzleClient } from "@pothos/plugin-drizzle";
import type {
  PgArray,
  PgColumn,
  PgTable,
  getTableConfig,
} from "drizzle-orm/pg-core";

export class PothosDrizzleGenerator {
  enums: Record<string, PothosSchemaTypes.EnumRef<any, any>> = {};
  inputOperators: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> =
    {};
  inputType: Record<
    string,
    Record<string, PothosSchemaTypes.InputObjectRef<any, any>>
  > = {};
  tables?: Record<
    string,
    {
      table: SchemaEntry;
      tableInfo: ReturnType<typeof getTableConfig>;
      relations: RelationsRecord;
    }
  >;

  builder: PothosSchemaTypes.SchemaBuilder<any>;
  constructor(builder: PothosSchemaTypes.SchemaBuilder<any>) {
    this.builder = builder;
    this.createInputType();
  }
  getClient(ctx: any) {
    const options = this.builder.options;
    const drizzleOption = options.drizzle;
    const client =
      drizzleOption.client instanceof Function
        ? drizzleOption.client(ctx)
        : drizzleOption.client;
    return client;
  }
  getRelations(): AnyRelations {
    const drizzleOption = this.builder.options.drizzle;
    const client = drizzleOption.client as DrizzleClient;
    return drizzleOption.relations ?? client._.relations;
  }
  getTables() {
    if (this.tables) return this.tables;
    const drizzleOption = this.builder.options.drizzle;
    const getConfig: typeof getTableConfig =
      drizzleOption.getTableConfig as typeof getTableConfig;
    const relations = this.getRelations();
    const tables = Object.values(relations)
      .filter((t) => isTable(t.table))
      .map(
        ({ name, table, relations }) =>
          [
            name,
            { table, tableInfo: getConfig(table as PgTable), relations },
          ] as const
      );
    this.tables = Object.fromEntries(tables);
    return this.tables;
  }

  getInputType(
    tableName: string,
    type: string,
    options: PothosSchemaTypes.InputObjectTypeOptions<any, any>
  ) {
    if (!this.inputType[tableName]) this.inputType[tableName] = {};
    if (this.inputType[tableName][type]) return this.inputType[tableName][type];
    const { tableInfo } = this.getTables()[tableName];
    const input = this.builder.inputType(
      `${tableInfo.name}Input${type}`,
      options
    );
    this.inputType[tableName][type] = input;
    return input;
  }

  getInputCreate(tableName: string) {
    const { tableInfo } = this.getTables()[tableName];
    return this.getInputType(tableName, "Create", {
      fields: (t) =>
        Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => [
            c.name,
            t.field({
              type: this.getDataType(c),
              required: c.notNull && !c.default,
            }),
          ])
        ),
    });
  }
  getInputUpdate(tableName: string) {
    const { tableInfo } = this.getTables()[tableName];
    return this.getInputType(tableName, "Update", {
      fields: (t) => {
        return Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => [
            c.name,
            t.field({
              type: this.getDataType(c),
            }),
          ])
        );
      },
    });
  }
  getInputWhere(tableName: string) {
    const { tableInfo } = this.getTables()[tableName];
    const inputWhere = this.getInputType(tableName, "Where", {
      fields: (t) => {
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
    });
    return inputWhere;
  }
  getInputOrderBy(tableName: string) {
    const { tableInfo } = this.getTables()[tableName];
    const inputWhere = this.getInputType(tableName, "OrderBy", {
      fields: (t) => {
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
    });
    return inputWhere;
  }

  getInputOperator(type: string | [string]) {
    const typeName = Array.isArray(type) ? `Array${type[0]}` : type;
    const input =
      this.inputOperators[typeName] ?? createInputOperator(this.builder, type);
    this.inputOperators[typeName] = input;
    return input;
  }
  createInputType() {
    const builder: PothosSchemaTypes.SchemaBuilder<any> = this.builder;

    const scalars = [
      ["BigInt", BigIntResolver],
      ["Date", DateResolver],
      ["Bytes", ByteResolver],
      ["DateTime", DateTimeResolver],
      ["Json", JSONResolver],
      ["Decimal", HexadecimalResolver],
    ] as const;
    for (const [scalarName, scalarResolver] of scalars) {
      if (!builder.configStore.hasConfig(scalarName)) {
        builder.addScalarType(scalarName as never, scalarResolver, {});
      }
    }

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
      case "enum": {
        const sqlType = c.getSQLType();
        const e = this.enums[sqlType];
        if (!e) {
          this.enums[sqlType] = this.builder.enumType(sqlType, {
            values: c.enumValues ?? [],
          });
        }
        return isArray ? [sqlType] : sqlType;
      }
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
