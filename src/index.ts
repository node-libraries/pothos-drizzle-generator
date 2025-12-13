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
import { users } from "./db/schema";
import PothosDrizzleGeneratorPlugin from "./pothos-drizzle-generator-plugin";
import type {
  DBQueryConfigColumns,
  ExtractTablesFromSchema,
  ExtractTablesWithRelationsParts,
  GetTableViewFieldSelection,
  RelationsBuilderConfig,
  Schema,
  TableRelationalConfig,
  TableTypeConfig,
} from "drizzle-orm";

const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

export interface PothosTypes {
  DrizzleRelations: typeof relations;
  Context: { name: string };
}

const builder = new SchemaBuilder<PothosTypes>({
  plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
  drizzle: {
    client: db,
    getTableConfig,
  },
  pothosDrizzleGenerator: {
    use: { include: ["categories"] },
    models: {
      posts: {
        fields: { exclude: ["authorId"] },
        orderBy: ({ ctx, name, operation }) => ({ id: "desc" }),
        where: ({ ctx, name, operation }) => ({ authorId: { eq: "" } }),
      },
    },
  },
});

db.query.users.findMany({ where: { AND: [] } });

const schema = builder.toSchema({ sortSchema: false });

const OperationFind = ["findFirst", "findMany"] as const;
const OperationCreate = ["createOne", "createMany"] as const;
const OperationUpdate = ["updateOne", "updateMany"] as const;
const OperationDelete = ["deleteOne", "deleteMany"] as const;
const OperationQuery = [...OperationFind, "count"] as const;
const OperationMutation = [
  ...OperationCreate,
  ...OperationUpdate,
  ...OperationDelete,
] as const;
const OperationAll = [
  "find",
  "update",
  "delete",
  "query",
  "mutation",
  ...OperationQuery,
  ...OperationMutation,
] as const;

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
app.post("/", (...params) =>
  graphqlServer({
    schema,
  })(...params)
);

serve(app);

console.log("http://localhost:3000");
