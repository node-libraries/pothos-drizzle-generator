import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { explorer } from "apollo-explorer/html";
import { relations } from "./db/relations";
import { drizzle } from "drizzle-orm/node-postgres";
import SchemaBuilder from "@pothos/core";
import { graphqlServer } from "@hono/graphql-server";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
// import RelayPlugin from "@pothos/plugin-relay";
import PothosDrizzleGeneratorPlugin from "./pothos-drizzle-generator-plugin";
import { generate } from "graphql-auto-query";
import { eq } from "drizzle-orm";
import { createInputOperator } from "./pothos-drizzle-generator-plugin/libs/utils";

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

const getSymbol = (o: Object, name: string) => {
  const symbol = Object.getOwnPropertySymbols(o).find(
    (v) => v.toString() === name
  );
  return symbol && Object.getOwnPropertyDescriptor(o, symbol)?.value;
};

// for (const { table, name, relations } of Object.values(
//   drizzleSchema._.relations
// )) {
// const baseName = getSymbol(table, "drizzle:Name");
// console.log(getSymbol(table, "Symbol(drizzle:Columns)"));
//   builder.drizzleObject(name as never, {
//     name: baseName,
//     fields: (t) =>
//       Object.fromEntries(
//         Object.entries(table).map(([name, type]) => [
//           name,
//           t.exposeString(name),
//         ])
//       ),
//   });
// }

// builder.drizzleObject("users", {
//   name: "users",
//   fields: (t) => ({
//     id: t.exposeID("id"),
//     email: t.expose("email", { type: "String" }),
//     age: t.exposeInt("age"),
//     name: t.exposeString("name"),
//     posts: t.relation("posts"),
//   }),
// });

// builder.drizzleObject("posts", {
//   name: "posts",
//   fields: (t) => ({
//     id: t.exposeID("id"),
//     email: t.exposeString("content"),
//     owner: t.relation("owner"),
//   }),
// });

// const stringInput = createInputOperator(builder, "String");

// const userInputWhere = builder.inputType("UserInputWhere", {
//   fields: (t) => ({
//     name: t.field({ type: builder.inputRef("StringInputOperator") }),
//     birthdate: t.field({ type: stringInput }),
//     height: t.field({ type: stringInput }),
//     OR: t.field({ type: [stringInput] }),
//   }),
// });

// db.query.users.findMany({
//   where: {
//     OR: [{ id: { isNotNull: true } }],
//   },
// });

// builder.queryType({
//   fields: (t) => ({
//     findManyUsers: t.drizzleField({
//       type: ["users"],
//       args: { where: t.arg({ type: UserInput }) },
//       resolve: async (query, _parent, args) => {
//         // console.log(query());
//         const v = await db.query.users.findMany(query(args as never));
//         console.log(v);
//         return v;
//       },
//     }),
//   }),
// });
const schema = builder.toSchema({ sortSchema: false });

// db.query.posts.findMany({where:{NOT:{},OR:[],AND:[]}})

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
      introspectionInterval: 5000,
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
