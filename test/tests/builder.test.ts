import { graphqlServer } from "@hono/graphql-server";
import SchemaBuilder from "@pothos/core";
import DrizzlePlugin from "@pothos/plugin-drizzle";
import { Client, cacheExchange, fetchExchange, gql } from "@urql/core";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { describe, expect, it } from "vitest";
import PothosDrizzleGeneratorPlugin from "../../src";
import { relations } from "../db/relations";
import type { Context } from "../context";
import type { TablesRelationalConfig } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

/**
 * GraphQL Query 定義
 */
const FIND_FIRST_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  query FindFirstPost($where: PostWhere, $orderBy: [PostOrderBy!]) {
    findFirstPost(where: $where, orderBy: $orderBy) {
      ...post
      author {
        id
        name
      }
      categories {
        id
        name
      }
    }
  }
`;

interface PostResponse {
  id: string;
  title: string;
  content: string;
  published: boolean;
  authorId: string;
  author: {
    id: string;
    name: string;
  };
  categories: { id: string; name: string }[];
}

describe("Builder test", () => {
  it("builder test", async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const url = new URL(connectionString);
    const searchPath = url.searchParams.get("schema") ?? "public";

    const db = drizzle({
      connection: {
        connectionString,
        options: `--search_path=${searchPath}`,
      },
      relations,
    });
    const builder = new SchemaBuilder<{
      DrizzleRelations: TablesRelationalConfig;
      Context: HonoContext<Context>;
    }>({
      plugins: [DrizzlePlugin, PothosDrizzleGeneratorPlugin],
      drizzle: {
        client: () => db,
        getTableConfig,
        relations,
      },
      pothosDrizzleGenerator: {},
    });
    const app = new Hono<Context>();
    const server = graphqlServer({
      schema: builder.toSchema(),
    });
    app.use(contextStorage());
    app.post("/", server);
    const client = new Client({
      url: "http://localhost/",
      exchanges: [cacheExchange, fetchExchange],
      fetch: async (url, options) => {
        const req = new Request(url, { ...options, method: "post" });
        return app.fetch(req);
      },
      requestPolicy: "network-only",
      preferGetMethod: false,
    });
    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST, {});
    expect(result).toBeDefined();
  });
});
