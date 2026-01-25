import type { Operation, OperationBasic } from "./libs/operations.js";
import type { PothosDrizzleGenerator } from "./PothosDrizzleGenerator.js";
import type { SchemaTypes } from "@pothos/core";
import type {
  AnyMany,
  DBQueryConfigColumns,
  GetTableViewFieldSelection,
  RelationsFilter,
  SchemaEntry,
  Table,
  SQL,
  InferInsertModel,
} from "drizzle-orm";

declare global {
  export namespace PothosSchemaTypes {
    /**
     * Interface for Pothos plugins.
     */
    export interface Plugins<Types extends SchemaTypes, T extends object = object> {
      pothosDrizzleGenerator: PothosDrizzleGenerator<Types, T>;
    }

    /**
     * Represents the Drizzle relations defined in the SchemaTypes.
     */
    type Relations<Types extends SchemaTypes> = Types["DrizzleRelations"];

    /**
     * Represents the names of the tables available in the relations.
     */
    type TableNames<Types extends SchemaTypes> = keyof Relations<Types>;

    /**
     * Gets the Drizzle table type for a specific table name.
     */
    type GetTable<
      Types extends SchemaTypes,
      U extends TableNames<Types>,
    > = Relations<Types>[U]["table"];

    /**
     * Represents any table type defined in the relations.
     */
    type AnyTable<Types extends SchemaTypes> = GetTable<Types, TableNames<Types>>;

    /**
     * Represents the column names of a specific table.
     */
    type Columns<
      Types extends SchemaTypes,
      U extends TableNames<Types>,
    > = keyof DBQueryConfigColumns<GetTableViewFieldSelection<GetTable<Types, U>>>;

    /**
     * Represents all possible column names across all tables.
     */
    type AnyColumns<Types extends SchemaTypes> =
      AnyTable<Types> extends infer R
        ? R extends SchemaEntry
          ? keyof DBQueryConfigColumns<GetTableViewFieldSelection<R>>
          : never
        : never;

    /**
     * Represents column names along with many-to-many or one-to-many relation names.
     */
    type ColumnsWithManyRelations<Types extends SchemaTypes, U extends TableNames<Types>> =
      | Columns<Types, U>
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]: unknown;
        }
      | keyof {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K extends string
              ? `${K}Count`
              : never
            : never]: unknown;
        };

    /**
     * Represents all possible columns with many relations across all tables.
     */
    type AnyColumnsWithManyRelations<Types extends SchemaTypes> = {
      [U in TableNames<Types>]: ColumnsWithManyRelations<Types, U>;
    }[TableNames<Types>];

    /**
     * Parameters passed to model-related option callbacks.
     */
    type ModelParams<Types extends SchemaTypes, U extends TableNames<Types>> = {
      modelName: U;
    };

    /**
     * Parameters passed to operation-related option callbacks.
     */
    type OperationParams<Types extends SchemaTypes, U extends TableNames<Types>> = {
      ctx: Types["Context"];
      modelName: U;
      operation: (typeof OperationBasic)[number];
    };

    /**
     * Utility type for including or excluding a set of values.
     */
    type IncludeExclude<T> =
      | { include: T[]; exclude?: undefined }
      | { exclude: T[]; include?: undefined };

    /**
     * Customize names for generated types for a model. Use `singular` and
     * `plural` for model names, and `operations` to customize operation names.
     */
    type AliasConfiguration = {
      singular?: string;
      plural?: string;
      operations?: { [key in (typeof OperationBasic)[number]]?: string };
    };

    /**
     * Selection of operations to include or exclude.
     */
    type OperationSelection = { 
      include?: Operation[]; 
      exclude?: Operation[];
    } | undefined;

    /**
     * Operators for filtering a specific column.
     */
    type FilterOperator<T> = {
      eq?: T;
      ne?: T;
      gt?: T;
      gte?: T;
      lt?: T;
      lte?: T;
      in?: T[];
      notIn?: T[];
      like?: T;
      notLike?: T;
      isNull?: boolean;
      isNotNull?: boolean;
    };

    /**
     * Recursive filter object for complex queries.
     */
    type FilterObject<T> = {
      [K in keyof T]?: T[K] | FilterOperator<T[K]>;
    } & {
      AND?: FilterObject<T>[];
      OR?: FilterObject<T>[];
      NOT?: FilterObject<T>;
    };

    /**
     * Return type for the `where` option.
     */
    type WhereReturn<Types extends SchemaTypes, U extends TableNames<Types>> =
      | FilterObject<GetTableViewFieldSelection<GetTable<Types, U>>>
      | RelationsFilter<Relations<Types>[U], Relations<Types>>
      | undefined;

    /**
     * Represents any possible `where` filter return type.
     */
    type AnyWhereReturn<Types extends SchemaTypes> = {
      [U in TableNames<Types>]: WhereReturn<Types, U>;
    }[TableNames<Types>];

    /**
     * Return type for the `orderBy` option.
     */
    type OrderByReturn<ColType extends string | number | symbol> =
      | { [P in ColType]?: "asc" | "desc" }
      | undefined;

    /**
     * Generic UpdateSetSource for any Table.
     */
    type UpdateSetSource<T extends Table> = {
      [K in keyof InferInsertModel<T>]?: InferInsertModel<T>[K] | SQL;
    };

    /**
     * Return type for the `inputData` option, used for create/update operations.
     */
    type InputDataReturn<Types extends SchemaTypes, U extends TableNames<Types>> =
      | (UpdateSetSource<GetTable<Types, U> extends Table ? GetTable<Types, U> : never> & {
          [K in keyof Relations<Types>[U]["relations"] as Relations<Types>[U]["relations"][K] extends AnyMany
            ? K
            : never]?: {
            set?: Array<Record<string, unknown>>;
          };
        })
      | undefined;

    /**
     * Options for a specific model (table) in the generator.
     */
    export interface ModelOptions<Types extends SchemaTypes, U extends TableNames<Types>> {
      /**
       * Define which fields to include or exclude for the model.
       */
      fields?: <T extends U>(
        params: ModelParams<Types, T>
      ) =>
        | IncludeExclude<U extends unknown ? ColumnsWithManyRelations<Types, U> : never>
        | undefined;

      /**
       * Define which operations (findMany, findFirst, etc.) to generate.
       */
      operations?: <T extends U>(params: ModelParams<Types, T>) => OperationSelection;

      /**
       * Customize names for types generated for the model (Operations, model name, etc.).
       */
      aliases?: <T extends U>(params: ModelParams<Types, T>) => AliasConfiguration;

      /**
       * Define which fields to include or exclude in the input types.
       */
      inputFields?: <T extends U>(
        params: ModelParams<Types, T>
      ) =>
        | IncludeExclude<U extends unknown ? ColumnsWithManyRelations<Types, U> : never>
        | undefined;

      /**
       * Limit the depth of nested relations in queries.
       */
      depthLimit?: <T extends U>(params: OperationParams<Types, T>) => number | undefined;

      /**
       * Determine if an operation is executable based on the context.
       */
      executable?: <T extends U>(params: OperationParams<Types, T>) => boolean | undefined;

      /**
       * Set a default limit for the number of records returned.
       */
      limit?: <T extends U>(params: OperationParams<Types, T>) => number | undefined;

      /**
       * Define the default sort order for queries.
       */
      orderBy?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? OrderByReturn<Columns<Types, U>> : never;

      /**
       * Define default filters for queries.
       */
      where?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? WhereReturn<Types, U> : never;

      /**
       * Provide default or transformation logic for input data.
       */
      inputData?: <T extends U>(
        params: OperationParams<Types, T>
      ) => U extends unknown ? InputDataReturn<Types, U> : never;
    }

    /**
     * Options for the Pothos Drizzle Generator plugin at the schema level.
     */
    export interface SchemaBuilderOptions<Types extends SchemaTypes> {
      pothosDrizzleGenerator?: {
        /**
         * Global selection of tables to include or exclude from generation.
         */
        use?: IncludeExclude<keyof Relations<Types>>;
        /**
         * Default options applied to all models.
         */
        all?: ModelOptions<Types, TableNames<Types>>;
        /**
         * Individual model overrides.
         */
        models?: {
          [U in TableNames<Types>]?: ModelOptions<Types, U>;
        };
      };
    }
  }
}