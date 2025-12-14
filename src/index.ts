import "dotenv/config";
import { graphqlServer } from "@hono/graphql-server";
import { serve } from "@hono/node-server";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { explorer } from "apollo-explorer/html";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generate } from "graphql-auto-query";
import { Hono } from "hono";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "./pothos-drizzle-generator-plugin";
import {
  isOperation,
  OperationMutation,
  OperationQuery,
} from "./pothos-drizzle-generator-plugin/libs/operations";

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
  plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
  drizzle: {
    client: () => db,
    relations,
    getTableConfig,
  },
  pothosDrizzleGenerator: {
    use: { exclude: ["postsToCategories"] },
    models: {
      users: {
        // データの変更禁止
        operations: { exclude: ["mutation"] },
      },
      posts: {
        // 上書き禁止フィールド
        inputFields: { exclude: ["createdAt", "updatedAt"] },
        // データ書き込み時は自分のIDを設定
        inputData: ({ ctx }) => {
          if (!ctx.userId) throw new Error("No permission");
          return { authorId: ctx.userId };
        },
        where: ({ ctx, operation }) => {
          // 抽出時は公開されているデータか、自分のデータ
          if (isOperation(OperationQuery, operation)) {
            return { OR: [{ published: true }, { authorId: ctx.userId }] };
          }
          // 書き込み時は自分のデータ
          if (isOperation(OperationMutation, operation)) {
            return { authorId: ctx.userId };
          }
        },
      },
    },
  },
});

const schema = builder.toSchema({ sortSchema: false });

const app = new Hono();
// Apollo Explorer
app.get("/", (c) => {
  return c.html(
    explorer({
      initialState: {
        // Set up sample GraphQL operations
        document: generate(schema, 1),
      },
      endpointUrl: "/",
      introspectionInterval: 10000,
    })
  );
});
app.post(
  "/",
  graphqlServer({
    schema,
  })
);

serve(app);

console.log("http://localhost:3000");
