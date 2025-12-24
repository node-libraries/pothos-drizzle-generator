import {
  isTable,
  sql,
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
import {
  createInputOperator,
  getQueryFields,
  type FieldTree,
} from "./libs/utils.js";
import type { SchemaTypes } from "@pothos/core";
import type { DrizzleClient } from "@pothos/plugin-drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  PgArray,
  PgColumn,
  PgTable,
  getTableConfig,
} from "drizzle-orm/pg-core";
import type { RelationalQueryBuilder } from "drizzle-orm/pg-core/query-builders/query";
import type { GraphQLResolveInfo } from "graphql";

type ModelData = {
  table: SchemaEntry;
  operations: (typeof OperationBasic)[number][];
  columns: PgColumn[];
  primaryColumns: PgColumn[];
  inputColumns: PgColumn[];
  tableInfo: ReturnType<typeof getTableConfig>;
  relations: RelationsRecord;
  executable?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => boolean | undefined)
    | undefined;
  limit?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => number | undefined)
    | undefined;
  orderBy?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  where?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  inputData?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => object | undefined)
    | undefined;
  depthLimit?:
    | ((params: {
        ctx: object;
        modelName: string;
        operation: (typeof OperationBasic)[number];
      }) => number | undefined)
    | undefined;
};

interface QueryDataType {
  columns?: Record<string, boolean>;
  with?: Record<string, QueryDataType>;
  _name?: string;
}

export class DrizzleGenerator<Types extends SchemaTypes> {
  enums: Record<string, PothosSchemaTypes.EnumRef<Types, unknown>> = {};
  inputOperators: Record<
    string,
    PothosSchemaTypes.InputObjectRef<Types, unknown>
  > = {};
  inputType: Record<
    string,
    Record<string, PothosSchemaTypes.InputObjectRef<Types, unknown>>
  > = {};
  tables?: Record<string, ModelData>;

  builder: PothosSchemaTypes.SchemaBuilder<Types>;
  constructor(builder: PothosSchemaTypes.SchemaBuilder<Types>) {
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
        const primaryColumns = Array.from(
          new Set([
            ...tableInfo.primaryKeys.flatMap((v) => v.columns),
            ...columns.filter((v) => v.primary),
          ])
        );

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
            primaryColumns,
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
  getClient(ctx: object) {
    const options = this.builder.options;
    const drizzleOption = options.drizzle;
    const client =
      drizzleOption.client instanceof Function
        ? drizzleOption.client(ctx)
        : drizzleOption.client;
    return client as NodePgDatabase;
  }
  getQueryTable(ctx: object, modelName: string) {
    return this.getClient(ctx).query[
      modelName as never
    ] as RelationalQueryBuilder<never, never>;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const builder: PothosSchemaTypes.SchemaBuilder<Types> = this.builder;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export const replaceColumnValues = (
  tables: Record<string, ModelData>,
  tableName: string,
  tree: FieldTree,
  queryData: {
    columns?: Record<string, boolean>;
    with?: Record<string, QueryDataType>;
    _name?: string;
  }
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
        value === true && columns.find((v) => v.name === name)
          ? [[name, true]]
          : []
      )
    );
  }
  if (queryData.with) {
    Object.entries(queryData.with).forEach(([name, query]) => {
      if (typeof tree[name] === "object") {
        replaceColumnValues(
          tables,
          (query as { _name: string })._name,
          tree[name],
          query
        );
      }
    });
  }
  return queryData;
};

export const getReturning = (info: GraphQLResolveInfo, columns: PgColumn[]) => {
  const fields = getQueryFields(info);
  const returnFields = columns
    .filter((v) => fields[v.name])
    .map((v) => [v.name, v]);
  if (!returnFields.length) return undefined;
  return Object.fromEntries(
    columns.filter((v) => fields[v.name]).map((v) => [v.name, v])
  );
};
