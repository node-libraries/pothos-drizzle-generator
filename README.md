# pothos-drizzle-generator

[![](https://img.shields.io/npm/l/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/v/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/dw/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/node-libraries/pothos-drizzle-generator)

A powerful Pothos plugin that automatically generates a complete GraphQL schema (Query & Mutation) based on your Drizzle ORM schema definition.

It eliminates boilerplate by creating types, input objects, and resolvers for standard CRUD operations while offering granular control over permissions, filtering, and field visibility.

![](./documents/image.png)

## Sample Repository

Check out the sample implementation here:
https://github.com/SoraKumo001/pothos-drizzle-generator-sample

## Requirements

- **drizzle-orm**: `v1.0.0-beta.8` or higher
- **@pothos/core**: `v4.0.0` or higher
- **@pothos/plugin-drizzle**: `v0.16.0` or higher

## Installation

Install the generator alongside Pothos and Drizzle dependencies:

```bash
npm install pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql
# or
pnpm add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql
# or
yarn add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql

```

## Quick Start

### 1. Setup Drizzle and Pothos

Register the `PothosDrizzleGeneratorPlugin` in your SchemaBuilder.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";

// 1. Initialize Drizzle Client
const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

// 2. Define Types
export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { userId?: string }; // Example context
}

// 3. Initialize Builder
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Register the generator plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  // 4. Configure Generator
  pothosDrizzleGenerator: {},
});

// 5. Generate Schema
const schema = builder.toSchema();
```

## Configuration Guide

The `pothosDrizzleGenerator` option allows you to control exactly how the schema is generated. You can apply settings globally via `all` or target specific tables via `models`.

### 1. Configuration

```ts
{
  pothosDrizzleGenerator: {
    all: {
       ...ModelOptions
    }
  }
}
```

The `all` option applies settings to **every model** in your Drizzle schema. It is the best place to define your baseline security rules, default limits, and standard field visibility.

| Property      | Description                                                                             | Callback Arguments              |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------- |
| `executable`  | Determines if an operation is allowed. Return `false` to throw a "No permission" error. | `{ ctx, modelName, operation }` |
| `fields`      | Controls which fields are exposed in the API. Use `include` or `exclude`.               | `{ modelName }`                 |
| `inputFields` | Controls which fields are accepted as input for Mutations.                              | `{ modelName }`                 |
| `operations`  | Specifies which CRUD operations (`findMany`, `create`, etc.) to generate.               | `{ modelName }`                 |
| `depthLimit`  | Limits query nesting depth to prevent performance issues.                               | `{ ctx, modelName, operation }` |
| `limit`       | Sets the default maximum number of records for `findMany` queries.                      | `{ ctx, modelName, operation }` |
| `orderBy`     | Defines the default sort order.                                                         | `{ ctx, modelName, operation }` |
| `where`       | Applies mandatory filters (e.g., for soft deletes or multi-tenancy).                    | `{ ctx, modelName, operation }` |
| `inputData`   | Injects server-side values (e.g., `userId`) into Mutations.                             | `{ ctx, modelName, operation }` |

### 2. Model-Specific Configuration (`models`)

The `models` option allows you to target specific tables by their name. Settings defined here **override** the settings in `all`.

This is useful for:

- Making specific tables read-only.
- Exposing sensitive fields only on certain models.
- Applying different authorization rules for "Admin" vs "User" tables.

The structure is:

```ts
{
  pothosDrizzleGenerator: {
    models: {
      [TableName]: { ...ModelOptions }
    }
  }
}
```

### 3. Comprehensive Configuration Example

Below is a comprehensive example showing how `all` and `models` work together to create a secure, production-ready schema.

```ts
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
  drizzle: {
    /* ... */
  },

  pothosDrizzleGenerator: {
    // 1. Global Exclusion: Don't generate schema for join tables
    use: { exclude: ["postsToCategories"] },

    // --- Global Defaults (Applied to everyone) ---
    all: {
      // Security: By default, only allow reading. Write operations require a logged-in user.
      executable: ({ ctx, operation }) => {
        if (
          operation.startsWith("create") ||
          operation.startsWith("update") ||
          operation.startsWith("delete")
        ) {
          return !!ctx.user;
        }
        return true;
      },

      // Visibility: Never expose password or secret fields globally.
      fields: () => ({ exclude: ["password", "secretKey"] }),

      // Inputs: Never allow clients to manually set system timestamps.
      inputFields: () => ({ exclude: ["createdAt", "updatedAt"] }),

      // Logic: Exclude soft-deleted records (where deletedAt is not null).
      where: ({ operation }) => {
        if (operation !== "delete") return { deletedAt: { isNull: true } };
        return {};
      },

      // Performance: Default limit of 50 records.
      limit: () => 50,
      depthLimit: () => 5,
    },

    // --- Model Overrides (Specific logic) ---
    models: {
      // Case 1: The 'users' table needs strict privacy.
      users: {
        // Override: Users can only see themselves.
        where: ({ ctx, operation }) => ({
          id: { eq: ctx.user?.id },
        }),
        // Override: Allow fetching only 1 record (profile) instead of list.
        limit: () => 1,
        // Override: Disable delete operation entirely for users.
        operations: () => ({ exclude: ["delete"] }),
      },

      // Case 2: The 'posts' table is public but owned.
      posts: {
        // Override: Allow fetching up to 100 posts (overriding global 50).
        limit: () => 100,

        // Injection: Automatically attach the authorId on creation.
        inputData: ({ ctx }) => {
          const user = ctx.get("user");
          if (!user) throw new Error("Unauthorized");
          return { authorId: user.id };
        },

        // Complex Filter: Show published posts OR my own posts.
        where: ({ ctx, operation }) => {
          if (operation === "findMany" || operation === "findFirst") {
            return {
              OR: [{ published: true }, { authorId: { eq: ctx.user?.id } }],
            };
          }
          // Users can only update/delete their own posts
          if (operation === "update" || operation === "delete") {
            return { authorId: ctx.user?.id };
          }
        },
      },

      // Case 3: The 'audit_logs' table is admin-only.
      audit_logs: {
        // Override: Only admins can access this table at all.
        executable: ({ ctx }) => !!ctx.user?.isAdmin,
      },
    },
  },
});
```

## Supported Features

### Operations (Query & Mutation)

The following operations are automatically generated for each model (unless excluded):

- **Reads:** `findMany`, `findFirst`, `count`
- **Writes:** `create`, `update`, `delete`

### Filtering (Where)

Complex filtering is supported out-of-the-box using the `where` argument.

**Logical Operators:**

- `AND`, `OR`, `NOT`

**Comparison Operators:**

- `eq`, `ne` (Equal / Not Equal)
- `gt`, `gte`, `lt`, `lte` (Greater/Less than)
- `in`, `notIn`
- `isNull`, `isNotNull`

**String Operators:**

- `like`, `notLike`
- `ilike`, `notIlike` (Case insensitive)

**Array Operators:**

- `arrayContained`, `arrayOverlaps`, `arrayContains`

## License

MIT
