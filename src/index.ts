import "dotenv/config";
import { graphqlServer } from "@hono/graphql-server";
import { serve } from "@hono/node-server";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { explorer } from "apollo-explorer/html";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { generate } from "graphql-auto-query";
import { Hono } from "hono";
import { relations } from "./db/relations";
import PothosDrizzleGeneratorPlugin from "./pothos-drizzle-generator-plugin";

const db = drizzle({
  connection: process.env.DATABASE_URL!,
  relations,
  logger: true,
});

export interface PothosTypes {
  DrizzleRelations: typeof relations;
}

const builder = new SchemaBuilder<PothosTypes>({
  plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
  drizzle: {
    client: db,
    getTableConfig,
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
app.post("/", (...params) =>
  graphqlServer({
    schema,
  })(...params)
);

serve(app);

console.log("http://localhost:3000");
