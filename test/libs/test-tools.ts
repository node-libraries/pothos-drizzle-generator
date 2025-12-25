import { graphqlServer } from "@hono/graphql-server";
import SchemaBuilder, {
  type NormalizeSchemeBuilderOptions,
} from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { Client, cacheExchange, fetchExchange, gql } from "@urql/core";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
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
}: {
  relations: TRelations;
}) => {
  return drizzle({
    connection: {
      connectionString,
      options: `--search_path=${searchPath}`,
    },
    relations,
    // logger: true,
  });
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
  return new SchemaBuilder<{
    DrizzleRelations: TRelations;
    Context: HonoContext;
  }>({
    plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
    drizzle: {
      client: () => createDB({ relations }),
      relations,
      getTableConfig,
    },
    pothosDrizzleGenerator,
  });
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
  const builder = createBuilder({ relations, pothosDrizzleGenerator });
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
  return { app, schema };
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
  const { app } = createApp({ relations, pothosDrizzleGenerator });
  const client = new Client({
    url: "http://localhost/",
    exchanges: [cacheExchange, fetchExchange],
    fetch: async (url, options) => {
      const req = new Request(url, { ...options, method: "post" });
      return app.fetch(req);
    },
    preferGetMethod: false,
  });
  return { app, client };
};
