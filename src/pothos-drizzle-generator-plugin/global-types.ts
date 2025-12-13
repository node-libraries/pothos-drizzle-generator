import { SchemaTypes } from "@pothos/core";
import type { PothosDrizzleGeneratorPlugin } from "./PothosDrizzleGeneratorPlugin";
import type {
  DBQueryConfigColumns,
  GetTableViewFieldSelection,
  RelationsFilter,
} from "drizzle-orm";
import type { OperationAll, OperationBasic } from "./libs/operations";

declare global {
  export namespace PothosSchemaTypes {
    export interface Plugins<
      Types extends SchemaTypes,
      T extends object = object
    > {
      pothosDrizzleGenerator: PothosDrizzleGeneratorPlugin<Types, T>;
    }
    type Relations<Types extends SchemaTypes> = Types["DrizzleRelations"];
    type Tables<Types extends SchemaTypes> = keyof Relations<Types>;
    type Columns<
      Types extends SchemaTypes,
      U extends Tables<Types>
    > = keyof DBQueryConfigColumns<
      GetTableViewFieldSelection<Relations<Types>[U]["table"]>
    >;
    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {
        use?:
          | { include: (keyof Relations<Types>)[]; exclude?: undefined }
          | { exclude: (keyof Relations<Types>)[]; include?: undefined };
        models?: {
          [U in Tables<Types>]?: {
            fields:
              | { include: Columns<Types, U>[]; exclude?: undefined }
              | {
                  exclude: Columns<Types, U>[];
                  include?: undefined;
                };
            operations?: {
              include?: (typeof OperationAll)[number][];
              exclude?: (typeof OperationAll)[number][];
            };
            executable?: (params: {
              ctx: Types["Context"];
              modelName: U;
              operation: (typeof OperationBasic)[number];
            }) => boolean;
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
          };
        };
      };
    }
  }
}
