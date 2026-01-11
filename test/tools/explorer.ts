import "dotenv/config";
import { serve } from "@hono/node-server";
import { explorer } from "apollo-explorer/html";
import { generate } from "graphql-auto-query";
import { relations } from "../db/relations";
import { onCreateBuilder } from "../libs/test-operations";
import { createApp } from "../libs/test-tools";

export const { app, schema, db } = createApp({
  searchPath: "public",
  relations,
  onCreateBuilder,
  pothosDrizzleGenerator: {},
});

app.get("/", (c) => {
  return c.html(
    explorer({
      initialState: {
        document: generate(schema, 1),
      },
      endpointUrl: "/",
      introspectionInterval: 10000,
    })
  );
});

serve(app);

console.log("http://localhost:3000");
