import "dotenv/config";
import { serve } from "@hono/node-server";
import { explorer } from "apollo-explorer/html";
import { generate } from "graphql-auto-query";
import { relations } from "../db/relations";
import { createApp } from "../libs/test-tools";

export const { app, schema } = createApp({
  relations,
  pothosDrizzleGenerator: {},
});
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

serve(app);

console.log("http://localhost:3000");
