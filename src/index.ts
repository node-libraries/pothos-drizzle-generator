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
import { and, eq, sql } from "drizzle-orm";
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
// db.delete(relations.users.table)
//   .where(eq(relations.users.table.email, "residual_carroll@hotmail.fr"))
//   .returning()
//   .then((v) => console.dir(v, { depth: null }));

// db.insert(relations.users.table)
//   .values([
//     { email: "test@test" + Math.random() },
//     { email: "test@test" + Math.random() },
//   ])
//   .returning()
//   .then((v) => console.dir(v, { depth: null }));

// db.update(relations.users.table)
//   .set({ email: "test@test" + Math.random() })
//   .where(and(eq(relations.users.table.id, "")))
//   .returning()

// db.query.users
//   .findMany({
//     columns: { id: true },
//     // with: {
//     //   posts: {
//     //     columns: {},
//     //     extras: { count: () => sql`count(*)` },
//     //   },
//     // },
//     orderBy: { id: "asc", email: "desc" },
//   })
// .then((v) => console.dir(v, { depth: null }));

// db.query.users
//   .findFirst({
//     // with: {
//     //   posts: {
//     //     columns: {},
//     //     extras: { count: () => sql`count(*)` },
//     //   },
//     // },
//     orderBy: { id: "asc" },
//   })
//   .then((v) => console.dir(v, { depth: null }));

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
//     name: t.exposeString("name"),
//     posts: t.relation("posts"),
//     count: t.field({
//       type: "Int",
//       select: {},
//       resolve: () => 0,
//       extensions: {
//         pothosDrizzleSelect:{

//         }
//       },
//     }),
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
