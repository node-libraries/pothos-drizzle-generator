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
import { expandOperations, OperationBasic } from "./libs/operations.js";
import { createInputOperator } from "./libs/utils.js";
import type { DrizzleClient } from "@pothos/plugin-drizzle";
import type {
  PgArray,
  PgColumn,
  PgTable,
  getTableConfig,
} from "drizzle-orm/pg-core";

type ModelData = {
  table: SchemaEntry;
  operations: (typeof OperationBasic)[number][];
  columns: PgColumn<any, object>[];
  inputColumns: PgColumn<any, object>[];
  tableInfo: ReturnType<typeof getTableConfig>;
  relations: RelationsRecord;
  executable?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => boolean | undefined)
    | undefined;
  limit?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => number | undefined)
    | undefined;
  orderBy?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  where?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  inputData?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  depthLimit?:
    | ((params: {
        ctx: any;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => number | undefined)
    | undefined;
};

export class DrizzleGenerator {
  enums: Record<string, PothosSchemaTypes.EnumRef<any, any>> = {};
  inputOperators: Record<string, PothosSchemaTypes.InputObjectRef<any, any>> =
    {};
  inputType: Record<
    string,
    Record<string, PothosSchemaTypes.InputObjectRef<any, any>>
  > = {};
  tables?: Record<string, ModelData>;

  builder: PothosSchemaTypes.SchemaBuilder<any>;
  constructor(builder: PothosSchemaTypes.SchemaBuilder<any>) {
    this.builder = builder;
    this.createInputType();
  }
  getTableConfig() {
    const drizzleOption = this.builder.options.drizzle;
    return drizzleOption.getTableConfig as (
      param: Parameters<typeof getTableConfig>[0] | SchemaEntry
    ) => ReturnType<typeof getTableConfig>;
  }
  createTableInfo(): Record<string, ModelData> {
    const options = this.builder.options.pothosDrizzleGenerator;
    const getConfig = this.getTableConfig();
    const relations = this.getRelations();
    const tables = Object.values(relations)
      .filter((t) => isTable(t.table))
      .map(({ name: modelName, table, relations }) => {
        const tableInfo = getConfig(table as PgTable);
        const allOptions = options?.all;
        const modelOptions = options?.models?.[modelName];
        const columns = tableInfo.columns;
        //Operations
        const operationValue = (
          modelOptions?.operations ?? allOptions?.operations
        )?.({ modelName });
        const operationIncludes = expandOperations(
          operationValue?.include ?? OperationBasic
        );
        const operationExcludes = expandOperations(
          operationValue?.exclude ?? []
        );
        const operations = operationIncludes.filter(
          (v) => !operationExcludes.includes(v)
        );
        // Columns filter
        const columnValue = (modelOptions?.fields ?? allOptions?.fields)?.({
          modelName,
        });
        const include = columnValue?.include ?? columns.map((c) => c.name);
        const exclude = columnValue?.exclude ?? [];
        const filterColumns = include.filter((name) => !exclude.includes(name));
        // Input columns filter
        const inputFieldValue = (
          modelOptions?.inputFields ?? allOptions?.inputFields
        )?.({ modelName });
        const includeInput =
          inputFieldValue?.include ?? columns.map((c) => c.name);
        const excludeInput = inputFieldValue?.exclude ?? [];
        const filterInputColumns = includeInput.filter(
          (name) => !excludeInput.includes(name)
        );
        return [
          modelName,
          {
            table,
            columns: columns.filter((c) => filterColumns.includes(c.name)),
            operations,
            inputColumns: columns.filter((c) =>
              filterInputColumns.includes(c.name)
            ),
            tableInfo,
            relations,
            executable: modelOptions?.executable ?? allOptions?.executable,
            limit: modelOptions?.limit ?? allOptions?.limit,
            orderBy: modelOptions?.orderBy ?? allOptions?.orderBy,
            where: modelOptions?.where ?? allOptions?.where,
            inputData: modelOptions?.inputData ?? allOptions?.inputData,
            depthLimit: modelOptions?.depthLimit ?? allOptions?.depthLimit,
          },
        ] as const;
      });
    const modelNames = tables.map(([name]) => name);
    // Model filter
    const include = options?.use?.include ?? modelNames;
    const exclude = options?.use?.exclude ?? [];
    const filterTables = include.filter((name) => !exclude.includes(name));
    return Object.fromEntries(
      tables.filter(([name]) => filterTables.includes(name))
    );
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
    const tables = this.createTableInfo();
    this.tables = tables;
    return tables;
  }
  getInputType(
    modelName: string,
    type: string,
    options: PothosSchemaTypes.InputObjectTypeOptions<any, any>
  ) {
    if (!this.inputType[modelName]) this.inputType[modelName] = {};
    if (this.inputType[modelName][type]) return this.inputType[modelName][type];
    const { tableInfo } = this.getTables()[modelName]!;
    const input = this.builder.inputType(`${tableInfo.name}${type}`, options);
    this.inputType[modelName][type] = input;
    return input;
  }

  getInputCreate(modelName: string) {
    const { inputColumns } = this.getTables()[modelName]!;
    return this.getInputType(modelName, "Create", {
      fields: (t) =>
        Object.fromEntries(
          inputColumns.map((c: PgColumn) => [
            c.name,
            t.field({
              type: this.getDataType(c),
              required: c.notNull && !c.default,
            }),
          ])
        ),
    });
  }
  getInputUpdate(modelName: string) {
    const { inputColumns } = this.getTables()[modelName]!;
    return this.getInputType(modelName, "Input", {
      fields: (t) => {
        return Object.fromEntries(
          inputColumns.map((c: PgColumn) => [
            c.name,
            t.field({
              type: this.getDataType(c),
            }),
          ])
        );
      },
    });
  }
  getInputWhere(modelName: string) {
    const { tableInfo } = this.getTables()[modelName]!;
    const inputWhere = this.getInputType(modelName, "Where", {
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
  getInputOrderBy(modelName: string) {
    const { tableInfo } = this.getTables()[modelName]!;
    const inputWhere = this.getInputType(modelName, "OrderBy", {
      fields: (t) => {
        return Object.fromEntries(
          tableInfo.columns.map((c: PgColumn) => {
            return [
              c.name,
              t.field({
                type: this.enums["OrderBy"]!,
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
    const type = isArray ? types[1]! : types[0]!;
    const scalerMap: Record<string, string> = {
      bigint: "BigInt",
      number: "Float",
      string: "String",
    };
    const result = scalerMap[type] ?? "String";
    return isArray ? [result] : result;
  }
}
