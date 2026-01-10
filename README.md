# Pothos Drizzle Generator

[![](https://img.shields.io/npm/l/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/v/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/dw/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/node-libraries/pothos-drizzle-generator)

**Pothos Drizzle Generator** is a robust Pothos plugin designed to automatically generate a complete GraphQL schema (Queries & Mutations) directly from your Drizzle ORM schema definitions.

By automating the creation of types, input objects, and resolvers for standard CRUD operations, this tool significantly reduces boilerplate code. It also provides granular control over permissions, complex filtering, and field visibility, ensuring your API remains secure and performant.

- Screenshot in ApolloExplorer

![](./documents/image.png)

## 🚀 Key Features

- **Automated CRUD Generation**: Instantly generates `findMany`, `findFirst`, `create`, `update`, and `delete` operations.
- **End-to-End Type Safety**: Ensures fully typed inputs and outputs that stay in sync with your Drizzle schema.
- **Deep Relational Filtering**: Apply filters, sorting, and pagination **not just to the main resource, but also to any nested relations** (e.g., "Find users and their _published_ posts").
- **Advanced Filtering**: Built-in support for complex queries, including `AND`, `OR`, `gt` (greater than), `contains`, and more.
- **Granular Access Control**: Configure visibility and permissions globally or on a per-model basis.
- **Smart Relations**: Seamlessly handles join tables and nested relationships.
- **Supported Databases**: PostgreSQL, SQLite.

## 🔗 Sample Repository

Explore a working implementation in the sample repository:
[https://github.com/SoraKumo001/pothos-drizzle-generator-sample](https://github.com/SoraKumo001/pothos-drizzle-generator-sample)

---

## 📦 Getting Started

### Requirements

Ensure your environment meets the following dependencies:

- **drizzle-orm**: `v1.0.0-beta.10`+
- **@pothos/core**: `v4.0.0`+
- **@pothos/plugin-drizzle**: `v0.16.2`+

### Installation

Install the generator alongside the required Pothos and Drizzle packages:

```bash
# npm
npm install pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql

# pnpm
pnpm add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql

# yarn
yarn add pothos-drizzle-generator @pothos/core @pothos/plugin-drizzle drizzle-orm graphql

```

---

## ⚡ Quick Start

Follow these steps to integrate the generator into your SchemaBuilder.

### 1. Setup & Initialization

Register the `PothosDrizzleGeneratorPlugin` and configure your Drizzle client.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";

// 1. Initialize Drizzle Client
const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

// 2. Define Context & Types
export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { userId?: string };
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
  // 4. Generator Configuration
  pothosDrizzleGenerator: {
    // Define your global and model-specific rules here
  },
});

// 5. Build Schema
const schema = builder.toSchema();
```

---

## ⚙️ Configuration Guide

The `pothosDrizzleGenerator` option offers a layered configuration approach, giving you full control over the generated schema.

Rules are applied in the following order:

1. **Selection (`use`)**: Define which tables to process.
2. **Global Defaults (`all`)**: Apply baseline rules to _every_ model.
3. **Model Overrides (`models`)**: Apply specific rules to individual models, overriding defaults.

### 1. Table Selection (`use`)

Control which tables are exposed in the GraphQL schema. This is useful for hiding internal tables or many-to-many join tables.

```ts
pothosDrizzleGenerator: {
  // Option A: Allowlist (Only generate these tables)
  use: { include: ["users", "posts", "comments"] },

  // Option B: Blocklist (Generate all EXCEPT these)
  use: { exclude: ["users_to_groups", "audit_logs"] },
}

```

### 2. Global Defaults (`all`)

Use the `all` key to establish project-wide conventions, such as security policies, default query limits, or field visibility.

```ts
pothosDrizzleGenerator: {
  all: {
    // Security: Require authentication for all write operations
    executable: ({ ctx, operation }) => {
       if (['create', 'update', 'delete'].includes(operation)) {
         return !!ctx.userId; // Must be logged in
       }
       return true; // Read operations are public
    },
    // Performance: Set a default limit for all queries
    limit: () => 50,
  }
}

```

### 3. Model Overrides (`models`)

Target specific tables by name to override global settings.

```ts
pothosDrizzleGenerator: {
  models: {
    users: {
      // Privacy: Users can only query their own record
      where: ({ ctx }) => ({ id: { eq: ctx.userId } }),
      // Security: Prevent user deletion via API
      operations: () => ({ exclude: ["delete"] })
    }
  }
}

```

### 4. API Reference

The following callbacks can be used within both `all` and `models`.

| Property      | Purpose                                                    | Arguments                       | Expected Return                  |
| ------------- | ---------------------------------------------------------- | ------------------------------- | -------------------------------- |
| `executable`  | Authorization check. Return `false` to block execution.    | `{ ctx, modelName, operation }` | `boolean`                        |
| `fields`      | Control output field visibility.                           | `{ modelName }`                 | `{ include?: [], exclude?: [] }` |
| `inputFields` | Control input field visibility (for mutations).            | `{ modelName }`                 | `{ include?: [], exclude?: [] }` |
| `operations`  | Select which CRUD operations to generate.                  | `{ modelName }`                 | `{ include?: [], exclude?: [] }` |
| `where`       | Apply mandatory filters (e.g., multi-tenancy).             | `{ ctx, modelName, operation }` | `FilterObject`                   |
| `limit`       | Set default max records for `findMany`.                    | `{ ctx, modelName, operation }` | `number`                         |
| `depthLimit`  | Prevent deeply nested queries.                             | `{ ctx, modelName, operation }` | `number`                         |
| `orderBy`     | Set default sort order.                                    | `{ ctx, modelName, operation }` | `{ [col]: 'asc' \| 'desc' }`     |
| `inputData`   | Inject server-side values (e.g., `userId`) into mutations. | `{ ctx, modelName, operation }` | `Object`                         |

### 5. Helper Functions

Import `isOperation` to simplify conditional logic within your callbacks.

```ts
import { isOperation } from "pothos-drizzle-generator";

// Usage Example
executable: ({ ctx, operation }) => {
  // Check if operation is a mutation (create/update/delete)
  if (isOperation("mutation", operation)) {
    return !!ctx.user;
  }
  return true;
},

```

**Available Operation Categories:**

- `OperationFind`: `findFirst`, `findMany`
- `OperationQuery`: `findFirst`, `findMany`, `count`
- `OperationCreate`: `createOne`, `createMany`
- `OperationUpdate`: `update`
- `OperationDelete`: `delete`
- `OperationMutation`: All write operations.
- `OperationAll`: Everything.

---

## 🛡️ Comprehensive Configuration Example

This example demonstrates a production-ready setup combining global security rules with specific model overrides.

```ts
import { isOperation } from "pothos-drizzle-generator";

const builder = new SchemaBuilder<PothosTypes>({
  // ... plugins setup
  pothosDrizzleGenerator: {
    // 1. Exclude join tables from the schema
    use: { exclude: ["postsToCategories"] },

    // 2. Global Defaults
    all: {
      // Security: Read-only for guests, Writes for logged-in users
      executable: ({ ctx, operation }) => {
        if (isOperation("mutation", operation)) return !!ctx.user;
        return true;
      },
      // Privacy: Hide sensitive fields everywhere
      fields: () => ({ exclude: ["password", "secretKey"] }),
      // Integrity: Protect system fields from manual input
      inputFields: () => ({ exclude: ["createdAt", "updatedAt"] }),
      // Logic: Filter out soft-deleted records (except when actually deleting)
      where: ({ operation }) => {
        if (operation !== "delete") return { deletedAt: { isNull: true } };
        return {};
      },
      // Performance: Default limits
      limit: () => 50,
      depthLimit: () => 5,
    },

    // 3. Model Overrides
    models: {
      users: {
        // Privacy: Users see only themselves
        where: ({ ctx }) => ({ id: { eq: ctx.user?.id } }),
        limit: () => 1,
        operations: () => ({ exclude: ["delete"] }),
      },
      posts: {
        limit: () => 100,
        // Automation: Attach current user as author
        inputData: ({ ctx }) => ({ authorId: ctx.user?.id }),
        // Logic: Public posts OR User's own posts
        where: ({ ctx, operation }) => {
          if (isOperation("find", operation)) {
            return {
              OR: [{ published: true }, { authorId: { eq: ctx.user?.id } }],
            };
          }
          // Security: Only edit/delete own posts
          if (isOperation(["update", "delete"], operation)) {
            return { authorId: ctx.user?.id };
          }
        },
      },
      audit_logs: {
        // Security: Admin access only
        executable: ({ ctx }) => !!ctx.user?.isAdmin,
      },
    },
  },
});
```

---

## 💡 Generated Schema Capabilities

### Optimized Data Retrieval (Solving N+1)

The generator's `findMany` operation is engineered for performance and flexibility.

- **Deep Filtering & Sorting**: You aren't limited to filtering the root node. You can apply specific `where` clauses, `limit`, and `orderBy` arguments **to any related field deep in the graph**.
- **Single Query Execution**: It consolidates fetching the main resource, related records, and counts into a **single, optimized SQL query**. This utilizes complex `JOIN` and `LATERAL` clauses to eliminate the N+1 problem.

**Example Query:**
_Fetching users and specifically only their 'published' posts._

```graphql
query {
  findManyUser {
    id
    name
    # Filter related records directly
    posts(where: { published: { eq: true } }, orderBy: { createdAt: desc }, limit: 5) {
      title
      createdAt
    }
  }
}
```

### Transactional Mutations

Write operations ensure data integrity through automatic transaction wrapping.

- **Atomic Operations**: When creating a record with related data (e.g., a Post with Categories), the entire process runs within a database transaction (`BEGIN` ... `COMMIT`).
- **Consistency**: If any part of the operation fails (e.g., inserting a relation), the entire action is rolled back, preventing orphaned data.

**Example Mutation:**

```graphql
mutation {
  createOnePost(
    input: {
      title: "My New Post"
      content: "Hello World"
      # Handles many-to-many relation automatically
      categories: { set: [{ id: "cat-1" }, { id: "cat-2" }] }
    }
  ) {
    id
    categories {
      name
    }
  }
}
```

---

## 🔍 Supported Features Checklist

### Operations

- **Queries**: `findMany`, `findFirst`, `count`
- **Mutations**: `create`, `update`, `delete`

### Advanced Filtering (`where`)

- **Logical**: `AND`, `OR`, `NOT`
- **Comparators**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`
- **Existence**: `isNull`, `isNotNull`
- **String Matching**: `like`, `notLike`, `ilike`, `notIlike`
- **Array Operations**: `arrayContained`, `arrayOverlaps`, `arrayContains`

## License

MIT
