/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-namespace */
import type { Operation, OperationBasic } from "./libs/operations.js";
import type { PothosDrizzleGenerator } from "./PothosDrizzleGenerator.js";
import type { SchemaTypes } from "@pothos/core";
import type {
  AnyMany,
  DBQueryConfigColumns,
  GetTableViewFieldSelection,
  RelationsFilter,
  SchemaEntry,
} from "drizzle-orm";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

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

    type GetTable<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > = Relations<Types>[U]["table"];

    type AnyTable<Types extends SchemaTypes> = GetTable<
      Types,
      TableNames<Types>
    >;

    type Columns<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > = keyof DBQueryConfigColumns<
      GetTableViewFieldSelection<GetTable<Types, U>>
    >;

    type AnyColumns<Types extends SchemaTypes> = AnyTable<Types> extends infer R
      ? R extends SchemaEntry
        ? keyof DBQueryConfigColumns<GetTableViewFieldSelection<R>>
        : never
      : never;

    type ColumnsWithManyRelations<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > =
      | Columns<Types, U>
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]: any;
        }
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K extends string
              ? `${K}Count`
              : never
            : never]: any;
        };

    type AnyColumnsWithManyRelations<Types extends SchemaTypes> = {
      [U in TableNames<Types>]: ColumnsWithManyRelations<Types, U>;
    }[TableNames<Types>];

    type ModelParams<Types extends SchemaTypes, U extends TableNames<Types>> = {
      modelName: U;
    };

    type OperationParams<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > = {
      ctx: Types["Context"];
      modelName: U;
      operation: (typeof OperationBasic)[number];
    };

    type IncludeExclude<T> =
      | { include: T[]; exclude?: undefined }
      | { exclude: T[]; include?: undefined };

    type OperationSelection =
      | { include?: Operation[]; exclude?: Operation[] }
      | undefined;

    type WhereReturn<Types extends SchemaTypes, U extends TableNames<Types>> =
      | RelationsFilter<Relations<Types>[U], Relations<Types>>
      | undefined;

    type OrderByReturn<
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Types extends SchemaTypes,
      ColType extends string | number | symbol
    > = { [P in ColType]?: "asc" | "desc" } | undefined;

    type InputDataReturn<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > =
      | (PgUpdateSetSource<
          GetTable<Types, U> extends PgTable<any> ? GetTable<Types, U> : never
        > & {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]?: {
            set?: Array<Record<string, unknown>>;
          };
        })
      | undefined;

    interface GlobalModelOptions<Types extends SchemaTypes> {
      fields?: <U extends TableNames<Types>>(
        params: ModelParams<Types, U>
      ) => IncludeExclude<AnyColumnsWithManyRelations<Types>> | undefined;
      operations?: <U extends TableNames<Types>>(
        params: ModelParams<Types, U>
      ) => OperationSelection;
      inputFields?: <U extends TableNames<Types>>(
        params: ModelParams<Types, U>
      ) => IncludeExclude<AnyColumnsWithManyRelations<Types>> | undefined;
      depthLimit?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) => number | undefined;
      executable?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) => boolean | undefined;
      limit?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) => number | undefined;
      orderBy?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) => OrderByReturn<Types, AnyColumns<Types>>;
      where?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) => WhereReturn<Types, any>;
      inputData?: <U extends TableNames<Types>>(
        params: OperationParams<Types, U>
      ) =>
        | PgUpdateSetSource<
            AnyTable<Types> extends PgTable ? AnyTable<Types> : never
          >
        | undefined;
    }

    interface SpecificModelOptions<
      Types extends SchemaTypes,
      U extends TableNames<Types>
    > {
      fields?: (
        params: ModelParams<Types, U>
      ) => IncludeExclude<ColumnsWithManyRelations<Types, U>> | undefined;
      operations?: (params: ModelParams<Types, U>) => OperationSelection;
      inputFields?: (
        params: ModelParams<Types, U>
      ) => IncludeExclude<ColumnsWithManyRelations<Types, U>> | undefined;
      depthLimit?: (params: OperationParams<Types, U>) => number | undefined;
      executable?: (params: OperationParams<Types, U>) => boolean | undefined;
      limit?: (params: OperationParams<Types, U>) => number | undefined;
      orderBy?: (
        params: OperationParams<Types, U>
      ) => OrderByReturn<Types, Columns<Types, U>>;
      where?: (params: OperationParams<Types, U>) => WhereReturn<Types, U>;
      inputData?: (
        params: OperationParams<Types, U>
      ) => InputDataReturn<Types, U>;
    }

    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {
        use?: IncludeExclude<keyof Relations<Types>>;
        all?: GlobalModelOptions<Types>;
        models?: {
          [U in TableNames<Types>]?: SpecificModelOptions<Types, U>;
        };
      };
    }
  }
}
