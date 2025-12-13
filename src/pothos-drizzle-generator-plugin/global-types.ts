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
          | { include: (keyof Relations<Types>)[] }
          | { exclude: (keyof Relations<Types>)[] };
        models?: {
          [U in Tables<Types>]?: {
            fields:
              | { include: Columns<Types, U>[] }
              | {
                  exclude: Columns<Types, U>[];
                };
            operations?: {
              include?: (typeof OperationAll)[number][];
              exclude?: (typeof OperationAll)[number][];
            };
            checkExecutable?: (params: {
              ctx: Types["Context"];
              name: U;
              operation: typeof OperationBasic;
            }) => boolean;
            limit?: (params: {
              ctx: Types["Context"];
              name: U;
              operation: typeof OperationBasic;
            }) => number;
            orderBy?: (params: {
              ctx: Types["Context"];
              name: U;
              operation: typeof OperationBasic;
            }) => { [P in Columns<Types, U>]?: "asc" | "desc" };
            where?: (params: {
              ctx: Types["Context"];
              name: U;
              operation: typeof OperationBasic;
            }) => RelationsFilter<Relations<Types>[U], Relations<Types>>;
          };
        };
      };
    }
  }
}
