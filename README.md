# pothos-drizzle-generator

[![](https://img.shields.io/npm/l/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/v/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![](https://img.shields.io/npm/dw/pothos-drizzle-generator)](https://www.npmjs.com/package/pothos-drizzle-generator)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/node-libraries/pothos-drizzle-generator)

A Pothos plugin that automatically generates GraphQL schemas based on Drizzle schema information.

![](./documents/image.png)

# sample

https://github.com/SoraKumo001/pothos-drizzle-generator-sample

# usage

To use this service, you must have version `drizzle-orm@1.0.0-beta.2` or later.

```ts
import "dotenv/config";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "pothos-drizzle-generator";

const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { userId?: string };
}

const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Set plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
});

const schema = builder.toSchema();
```

# Options

Settings defined in `all` are overridden by `models`.

```ts
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Set plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  pothosDrizzleGenerator: {
    // Specifying the Maximum Query Depth
    depthLimit: ({ ctx, modelName, operation }) => $limit$,
    // Specifying the model to use
    use: { include: [...$modelNames$], exclude: [...$modelNames$] },
    // Applies to all models
    all:{
      // Specifying fields to use in queries
      fields: ({ modelName }) => { include: [...$fields$], exclude: [...$fields$] },
      // Specifying the method of operation for the model
      operations: ({ modelName }) => { include: [...$operation$], exclude: [...$operation$] },
      // Runtime Permission Check
      executable: ({ ctx, modelName, operation }) => $permission$,
      // Specify the maximum value for the query's limit
      limit: ({ ctx, modelName, operation }) => $limit$,
      // Override the query's orderBy
      orderBy: ({ ctx, modelName, operation }) => $orderBy$,
      // Add query conditions
      where: ({ ctx, modelName, operation }) => $where$,
      // Specifying input fields
      inputFields: { include: [$fields$], exclude: [$fields$] },
      // Overwriting input data
      inputData: ({ ctx, modelName, operation }) => $inputData$,
    },
    // Apply to individual models
    models: {
      [$modelName$]: {
        // Specifying fields to use in queries
        fields: ({ modelName }) => { include: [...$fields$], exclude: [...$fields$] },
        // Specifying the method of operation for the model
        operations: ({ modelName }) => { include: [...$operation$], exclude: [...$operation$] },
        // Runtime Permission Check
        executable: ({ ctx, modelName, operation }) => $permission$,
        // Specify the maximum value for the query's limit
        limit: ({ ctx, modelName, operation }) => $limit$,
        // Override the query's orderBy
        orderBy: ({ ctx, modelName, operation }) => $orderBy$,
        // Add query conditions
        where: ({ ctx, modelName, operation }) => $where$,
        // Specifying input fields
        inputFields: { include: [$fields$], exclude: [$fields$] },
        // Overwriting input data
        inputData: ({ ctx, modelName, operation }) => $inputData$,
      },
    },
  },
});
```

- example

```ts
const builder = new SchemaBuilder<PothosTypes>({
  plugins: [
    DrizzlePlugin,
    PothosDrizzleGeneratorPlugin, // Set plugin
  ],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  pothosDrizzleGenerator: {
    // Tables not used
    use: { exclude: ["postsToCategories"] },
    all: {
      // Maximum query depth
      depthLimit: () => 5,
      executable: ({ operation, ctx }) => {
        // Prohibit write operations if the user is not authenticated
        if (isOperation(OperationMutation, operation) && !ctx.get("user")) {
          return false;
        }
        return true;
      },
      inputFields: () => {
        // Exclude auto-generated fields
        return { exclude: ["createdAt", "updatedAt"] };
      },
    },
    models: {
      users: {
        // Prohibit data modification
        // operations: { exclude: ["mutation"] },
      },
      posts: {
        // Fields that cannot be overwritten
        // inputFields: () => ({ exclude: ["createdAt", "updatedAt"] }), // Defined in "all", so commented out
        // Set the current user's ID when writing data
        inputData: ({ ctx }) => {
          const user = ctx.get("user");
          if (!user) throw new Error("No permission");
          return { authorId: user.id };
        },
        where: ({ ctx, operation }) => {
          // When querying, only return published data or the user's own data
          if (isOperation(OperationQuery, operation)) {
            return {
              OR: [
                { published: true },
                { authorId: { eq: ctx.get("user")?.id } },
              ],
            };
          }
          // When writing, only allow operations on the user's own data
          if (isOperation(OperationMutation, operation)) {
            return { authorId: ctx.get("user")?.id };
          }
        },
      },
    },
  },
});
```

# Current implementation status

## Operations

- findMany
- findFirst
- count
- create
- update
- delete

## Parameters

- where
- orderBy
- offset
- limit

## operators

- AND
- OR
- NOT
- eq
- ne
- gt
- gte
- lt
- lte
- like
- notLike
- ilike
- notIlike
- isNull
- isNotNull,
- in,
- notIn
- arrayContained
- arrayOverlaps
- arrayContains
