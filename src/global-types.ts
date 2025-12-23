import type { SchemaTypes } from "@pothos/core";
import type { PothosDrizzleGenerator } from "./PothosDrizzleGenerator.js";
import type {
  DBQueryConfigColumns,
  GetTableViewFieldSelection,
  RelationsFilter,
  SchemaEntry,
} from "drizzle-orm";
import type { Operation, OperationBasic } from "./libs/operations.js";
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core";

declare global {
  export namespace PothosSchemaTypes {
    export interface Plugins<
      Types extends SchemaTypes,
      T extends object = object
    > {
      pothosDrizzleGenerator: PothosDrizzleGenerator<Types, T>;
    }
    type Relations<Types extends SchemaTypes> = Types["DrizzleRelations"];
    type TableNames<Types extends SchemaTypes> = keyof Relations<Types>;
    type Columns<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > = keyof DBQueryConfigColumns<
      GetTableViewFieldSelection<Relations<Types>[U]["table"]>
    >;
    type AnyTable<Types extends SchemaTypes> =
      Relations<Types>[keyof Relations<Types>]["table"];

    type AnyColumns<Types extends SchemaTypes> = AnyTable<Types> extends infer R
      ? R extends SchemaEntry
        ? keyof DBQueryConfigColumns<GetTableViewFieldSelection<R>>
        : never
      : never;

    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {
        use?:
          | { include: (keyof Relations<Types>)[]; exclude?: undefined }
          | { exclude: (keyof Relations<Types>)[]; include?: undefined };
        all?: {
          depthLimit?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) => number | undefined;
          fields?: <U extends TableNames<Types>>(params: {
            modelName: U;
          }) =>
            | {
                include: AnyColumns<Types>[];
                exclude?: undefined;
              }
            | {
                exclude: AnyColumns<Types>[];
                include?: undefined;
              }
            | undefined;
          operations?: <U extends TableNames<Types>>(params: {
            modelName: U;
          }) =>
            | {
                include?: Operation[];
                exclude?: Operation[];
              }
            | undefined;
          executable?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) => boolean | undefined;
          limit?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) => number | undefined;
          orderBy?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) => { [P in AnyColumns<Types>]?: "asc" | "desc" } | undefined;
          where?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) =>
            | RelationsFilter<Relations<Types>[any], Relations<Types>>
            | undefined;
          inputFields?: <U extends TableNames<Types>>(params: {
            modelName: U;
          }) =>
            | {
                include: AnyColumns<Types>[];
                exclude?: undefined;
              }
            | {
                exclude: AnyColumns<Types>[];
                include?: undefined;
              }
            | undefined;
          inputData?: <U extends TableNames<Types>>(params: {
            ctx: Types["Context"];
            modelName: U;
            operation: (typeof OperationBasic)[number];
          }) =>
            | PgInsertValue<
                AnyTable<Types> extends PgTable ? AnyTable<Types> : never,
                true
              >
            | undefined;
        };
        models?: {
          [U in TableNames<Types>]?: {
            depthLimit?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) => number | undefined;
            fields?: (params: { modelName: U }) =>
              | { include: Columns<Types, U>[]; exclude?: undefined }
              | {
                  exclude: Columns<Types, U>[];
                  include?: undefined;
                };
            operations?: <U extends TableNames<Types>>(params: {
              modelName: U;
            }) =>
              | {
                  include?: Operation[];
                  exclude?: Operation[];
                }
              | undefined;

            executable?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) => boolean | undefined;
            limit?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) => number | undefined;
            orderBy?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) => { [P in Columns<Types, U>]?: "asc" | "desc" } | undefined;
            where?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) =>
              | RelationsFilter<Relations<Types>[U], Relations<Types>>
              | undefined;
            inputFields?: (params: { modelName: U }) =>
              | { include: Columns<Types, U>[]; exclude?: undefined }
              | {
                  exclude: Columns<Types, U>[];
                  include?: undefined;
                };
            inputData?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) =>
              | PgInsertValue<
                  Relations<Types>[U]["table"] extends PgTable<any>
                    ? Relations<Types>[U]["table"]
                    : never
                >
              | undefined;
          };
        };
      };
    }
  }
}
