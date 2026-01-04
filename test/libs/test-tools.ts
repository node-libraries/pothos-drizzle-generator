import { parse } from "node:path";
import { fileURLToPath } from "node:url";
import { graphqlServer } from "@hono/graphql-server";
import SchemaBuilder, { type NormalizeSchemeBuilderOptions } from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { Client, cacheExchange, fetchExchange } from "@urql/core";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig } from "drizzle-orm/pg-core";
import { seed } from "drizzle-seed";
import { isObjectType, type GraphQLSchema } from "graphql";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getContext } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import PothosDrizzleGeneratorPlugin from "../../src/index";
import * as schema from "../db/schema.js";
import type { Context } from "../context";
import type { AnyRelations, EmptyRelations, TablesRelationalConfig } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
export const createDB = <TRelations extends TablesRelationalConfig>({
  relations,
  isLog,
  searchPath,
}: {
  relations: TRelations;
  isLog?: boolean;
  searchPath: string;
}) => {
  const logs: { query: string; params: unknown[] }[] = [];
  const db = drizzle({
    connection: {
      connectionString,
      options: `--search_path=${searchPath}`,
    },
    relations,
    logger: {
      logQuery: (query, params) => {
        if (isLog) {
          console.log(
            "---\n",
            query,
            `\n{${params.map((value, index) => `$${index + 1}='${value}'`).join(",")}}`
          );
        }
        logs.push({ query, params });
      },
    },
  });
  const resetSchema = async () => {
    await db.execute(`drop schema ${searchPath} cascade`).catch(() => {});
    await migrate(db, { migrationsFolder: "./test/drizzle", migrationsSchema: searchPath });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { test, ...s } = schema;
    await seed(db, s);
  };
  const dropSchema = async () => {
    await db.execute(`drop schema ${searchPath} cascade`).catch(() => {});
  };
  return { resetSchema, db: Object.assign(db, { _logs: logs, resetSchema, dropSchema }) };
};

export const clearLogs = (db: ReturnType<typeof createDB>["db"]) => {
  db._logs.splice(0);
};
export const getLogs = (db: ReturnType<typeof createDB>["db"]) => {
  return db._logs;
};

export const createBuilder = <TRelations extends AnyRelations = EmptyRelations>({
  relations,
  pothosDrizzleGenerator,
  onCreateBuilder,
  searchPath,
}: {
  searchPath: string;
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext<Context>;
    }>
  >["pothosDrizzleGenerator"];
  onCreateBuilder?: (
    builder: PothosSchemaTypes.SchemaBuilder<
      PothosSchemaTypes.ExtendDefaultTypes<{
        DrizzleRelations: TRelations;
        Context: HonoContext<Context>;
      }>
    >
  ) => void;
}) => {
  const { db } = createDB({ relations, searchPath });
  const builder = new SchemaBuilder<{
    DrizzleRelations: TRelations;
    Context: HonoContext<Context>;
  }>({
    plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
    drizzle: {
      client: db,
      getTableConfig,
    },
    pothosDrizzleGenerator,
  });
  onCreateBuilder?.(builder);
  return { db, builder };
};

export const createApp = <TRelations extends AnyRelations = EmptyRelations>({
  searchPath,
  relations,
  pothosDrizzleGenerator,
  onCreateBuilder,
}: {
  searchPath: string;
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext;
    }>
  >["pothosDrizzleGenerator"];
  onCreateBuilder?: (
    builder: PothosSchemaTypes.SchemaBuilder<
      PothosSchemaTypes.ExtendDefaultTypes<{
        DrizzleRelations: TRelations;
        Context: HonoContext<Context>;
      }>
    >
  ) => void;
}) => {
  const { builder, db } = createBuilder({
    searchPath,
    relations,
    pothosDrizzleGenerator,
    onCreateBuilder,
  });
  const schema = builder.toSchema({ sortSchema: false });

  const app = new Hono<Context>();
  const server = graphqlServer({
    schema,
  });
  app.use(contextStorage());
  app.post("/", async (c, next) => {
    // Get the user from the token
    const cookies = getCookie(c);
    const token = cookies["auth-token"] ?? "";
    const secret = process.env.SECRET;
    const user = await jwtVerify(token, new TextEncoder().encode(secret))
      .then((data) => data.payload.user as unknown)
      .catch(() => undefined);
    const context = getContext<Context>();
    context.set("user", user as never);

    return server(c, next);
  });
  return {
    app,
    schema,
    db,
  };
};

export const createClient = <TRelations extends AnyRelations = EmptyRelations>({
  searchPath,
  relations,
  pothosDrizzleGenerator,
  onCreateBuilder,
}: {
  searchPath: string;
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext;
    }>
  >["pothosDrizzleGenerator"];
  onCreateBuilder?: (
    builder: PothosSchemaTypes.SchemaBuilder<
      PothosSchemaTypes.ExtendDefaultTypes<{
        DrizzleRelations: TRelations;
        Context: HonoContext<Context>;
      }>
    >
  ) => void;
}) => {
  const { app, db, schema } = createApp({
    searchPath,
    relations,
    pothosDrizzleGenerator,
    onCreateBuilder,
  });
  let cookie = "";
  const client = new Client({
    url: "http://localhost/",
    exchanges: [cacheExchange, fetchExchange],
    fetch: async (url, options) => {
      const headers = new Headers(options?.headers);
      if (cookie) {
        headers.set("cookie", cookie);
      }
      const req = new Request(url, { ...options, method: "post", headers });
      const res = await app.fetch(req, options);
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        cookie = setCookie;
      }
      return res;
    },
    requestPolicy: "network-only",
    preferGetMethod: false,
  });
  return { app, client, db, schema };
};

export function filterObject(obj: object, keys: string[]): object {
  if (Array.isArray(obj)) {
    return obj.map((item) => filterObject(item, keys));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!keys.includes(k)) {
        result[k] = filterObject(v, keys);
      }
    }
    return result;
  }
  return obj;
}

export const getGraphqlOperations = (schema: GraphQLSchema) => {
  return [
    schema.getQueryType()?.getFields(),
    schema.getMutationType()?.getFields(),
    schema.getSubscriptionType()?.getFields(),
  ].flatMap((v) => (v ? Object.keys(v) : []));
};

export const getGraphqlModels = (schema: GraphQLSchema) => {
  return Object.values(schema.getTypeMap()).flatMap((v) =>
    isObjectType(v) &&
    !v.name.startsWith("__") &&
    !["Query", "Mutation", "Subscription"].includes(v.name)
      ? [v]
      : []
  );
};

export const getSearchPath = (url: string) => {
  const filePath = fileURLToPath(url);
  return parse(filePath)
    .name.toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
};
