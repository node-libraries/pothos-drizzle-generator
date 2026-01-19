# ⚙️ Configuration Guide

[🔙 Back to Main README](../README.md)

The `pothosDrizzleGenerator` option offers a layered configuration approach, giving you full control over the generated schema.

Rules are applied in the following order:

1. **Selection (`use`)**: Define which tables to process.
2. **Global Defaults (`all`)**: Apply baseline rules to _every_ model.
3. **Model Overrides (`models`)**: Apply specific rules to individual models, overriding defaults.

## 1. Table Selection (`use`)

Control which tables are exposed in the GraphQL schema. This is useful for hiding internal tables or many-to-many join tables.

```ts
pothosDrizzleGenerator: {
  // Option A: Allowlist (Only generate these tables)
  use: { include: ["users", "posts", "comments"] },

  // Option B: Blocklist (Generate all EXCEPT these)
  use: { exclude: ["users_to_groups", "audit_logs"] },
}

```

## 2. Global Defaults (`all`)

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

## 3. Model Overrides (`models`)

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

## 4. API Reference

The following callbacks can be used within both `all` and `models`.

| Property      | Purpose                                                    | Arguments                       | Expected Return                                        |
| ------------- | ---------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `executable`  | Authorization check. Return `false` to block execution.    | `{ ctx, modelName, operation }` | `boolean`                                              |
| `fields`      | Control output field visibility.                           | `{ modelName }`                 | `{ include?: [], exclude?: [] }`                       |
| `inputFields` | Control input field visibility (for mutations).            | `{ modelName }`                 | `{ include?: [], exclude?: [] }`                       |
| `operations`  | Select which CRUD operations to generate.                  | `{ modelName }`                 | `{ include?: [], exclude?: [] }`                       |
| `aliases`     | Customize GraphQL type and operation names.                | `{ modelName }`                 | `{ singular?: string, plural?: string, operations?: {} }` |
| `where`       | Apply mandatory filters (e.g., multi-tenancy).             | `{ ctx, modelName, operation }` | `FilterObject`                                         |
| `limit`       | Set default max records for `findMany`.                    | `{ ctx, modelName, operation }` | `number`                                               |
| `depthLimit`  | Prevent deeply nested queries.                             | `{ ctx, modelName, operation }` | `number`                                               |
| `orderBy`     | Set default sort order.                                    | `{ ctx, modelName, operation }` | `{ [col]: 'asc' \| 'desc' }`                           |
| `inputData`   | Inject server-side values (e.g., `userId`) into mutations. | `{ ctx, modelName, operation }` | `Object`                                               |

## 5. Aliases - Customize Type & Operation Names

The `aliases` configuration allows you to customize both GraphQL type names and operation names, giving you full control over your API's naming conventions.

### Type Name Aliases

Use `singular` to rename the GraphQL type generated for a model:

```ts
pothosDrizzleGenerator: {
  models: {
    posts: {
      aliases: () => ({
        singular: "Article",  // Renames "Post" → "Article"
      })
    }
  }
}
```

This changes:
- GraphQL type: `Post` → `Article`
- Input types: `PostCreate` → `ArticleCreate`, `PostWhere` → `ArticleWhere`, etc.

### Operation Name Aliases

Use `operations` to rename individual CRUD operations:

```ts
pothosDrizzleGenerator: {
  models: {
    posts: {
      aliases: () => ({
        operations: {
          findMany: "listArticles",
          findFirst: "getArticle",
          count: "countArticles",
          createOne: "createArticle",
          createMany: "createArticles",
          update: "updateArticles",
          delete: "deleteArticles",
        }
      })
    }
  }
}
```

**Default Behavior:**
- If an operation alias is provided, it's used directly as the operation name
- If no operation alias is provided, the default pattern is used: `{operation}{SingularTypeName}`
  - Examples: `findManyPost`, `createOneUser`, `updateCategory`

### Combining Type & Operation Aliases

You can use both together for complete customization:

```ts
pothosDrizzleGenerator: {
  models: {
    posts: {
      aliases: () => ({
        singular: "BlogPost",
        operations: {
          findMany: "listBlogPosts",
          createOne: "publishBlogPost",
        }
      })
    }
  }
}
```

This creates:
- Type: `BlogPost` (with `BlogPostCreate`, `BlogPostWhere`, etc.)
- Operations: `listBlogPosts`, `publishBlogPost`, `findFirstBlogPost`, `countBlogPost`, etc.

## 6. Helper Functions

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

## 7. Comprehensive Configuration Example

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
        // Naming: Use domain-specific terminology
        aliases: () => ({
          singular: "Member",
          operations: {
            findMany: "listMembers",
            findFirst: "getMember",
          }
        }),
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
        // Naming: Blog-specific operations
        aliases: () => ({
          singular: "Article",
          operations: {
            createOne: "publish",
            update: "revise",
            delete: "unpublish",
          }
        }),
      },
      audit_logs: {
        // Security: Admin access only
        executable: ({ ctx }) => !!ctx.user?.isAdmin,
      },
    },
  },
});
```