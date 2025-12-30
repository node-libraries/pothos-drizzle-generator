import { graphqlServer } from "@hono/graphql-server";
import SchemaBuilder, {
  type NormalizeSchemeBuilderOptions,
} from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { Client, cacheExchange, fetchExchange } from "@urql/core";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { isObjectType, type GraphQLSchema } from "graphql";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { getContext } from "hono/context-storage";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import PothosDrizzleGeneratorPlugin from "../../src/index";
import type { HonoContext } from "../context";
import type { Context } from "../context";
import type { AnyRelations, EmptyRelations } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const url = new URL(connectionString);
const searchPath = url.searchParams.get("schema") ?? "public";

export const createDB = <TRelations extends AnyRelations = EmptyRelations>({
  relations,
  isLog,
}: {
  relations: TRelations;
  isLog?: boolean;
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
            `\n{${params
              .map((value, index) => `$${index + 1}='${value}'`)
              .join(",")}}`
          );
        }
        logs.push({ query, params });
      },
    },
  });
  (db as typeof db & { _logs: typeof logs })._logs = logs;
  return db as typeof db & { _logs: typeof logs };
};

export const clearLogs = (db: ReturnType<typeof createDB>) => {
  db._logs.splice(0);
};
export const getLogs = (db: ReturnType<typeof createDB>) => {
  return db._logs;
};

export const createBuilder = <
  TRelations extends AnyRelations = EmptyRelations
>({
  relations,
  pothosDrizzleGenerator,
}: {
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext;
    }>
  >["pothosDrizzleGenerator"];
}) => {
  const db = createDB({ relations });
  const builder = new SchemaBuilder<{
    DrizzleRelations: TRelations;
    Context: HonoContext;
  }>({
    plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
    drizzle: {
      client: db,
      relations,
      getTableConfig,
    },
    pothosDrizzleGenerator,
  });
  return { db, builder };
};

export const createApp = <TRelations extends AnyRelations = EmptyRelations>({
  relations,
  pothosDrizzleGenerator,
}: {
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext;
    }>
  >["pothosDrizzleGenerator"];
}) => {
  const { builder, db } = createBuilder({ relations, pothosDrizzleGenerator });
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
  relations,
  pothosDrizzleGenerator,
}: {
  relations: TRelations;
  pothosDrizzleGenerator?: NormalizeSchemeBuilderOptions<
    PothosSchemaTypes.ExtendDefaultTypes<{
      DrizzleRelations: TRelations;
      Context: HonoContext;
    }>
  >["pothosDrizzleGenerator"];
}) => {
  const { app, db, schema } = createApp({ relations, pothosDrizzleGenerator });
  const client = new Client({
    url: "http://localhost/",
    exchanges: [cacheExchange, fetchExchange],
    fetch: async (url, options) => {
      const req = new Request(url, { ...options, method: "post" });
      return app.fetch(req);
    },
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
  return Object.values(schema.getTypeMap()).filter(
    (v) =>
      isObjectType(v) &&
      !v.name.startsWith("__") &&
      !["Query", "Mutation", "Subscription"].includes(v.name)
  );
};
