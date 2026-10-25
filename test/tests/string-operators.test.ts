import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

const FIND_POSTS = gql`
  query FindPosts($where: PostWhere) {
    findManyPost(where: $where) {
      id
      title
      author {
        id
        name
      }
    }
  }
`;

describe("String Filter Operators (contains, startsWith, endsWith, icontains)", () => {
  let authorId = "";

  beforeAll(async () => {
    await db.resetSchema();
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");
    authorId = author.id;

    // Insert known posts
    const { posts } = await import("../db/schema");
    await db.insert(posts).values([
      { title: "Alpha Tech Post", authorId },
      { title: "Beta Science Article", authorId },
      { title: "Gamma TECH News", authorId },
      { title: "Delta Ending", authorId },
    ]);
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should filter by contains operator (case-sensitive)", async () => {
    const result = await client.query<{ findManyPost: { title: string }[] }>(FIND_POSTS, {
      where: {
        title: { contains: "Tech" },
      },
    });

    expect(result.error).toBeUndefined();
    const titles = result.data?.findManyPost.map((p) => p.title);
    expect(titles).toContain("Alpha Tech Post");
    expect(titles).not.toContain("Gamma TECH News");
  });

  it("should filter by icontains operator (case-insensitive)", async () => {
    const result = await client.query<{ findManyPost: { title: string }[] }>(FIND_POSTS, {
      where: {
        title: { icontains: "tech" },
      },
    });

    expect(result.error).toBeUndefined();
    const titles = result.data?.findManyPost.map((p) => p.title);
    expect(titles).toContain("Alpha Tech Post");
    expect(titles).toContain("Gamma TECH News");
    expect(titles).not.toContain("Beta Science Article");
  });

  it("should filter by startsWith and istartsWith operators", async () => {
    const result = await client.query<{ findManyPost: { title: string }[] }>(FIND_POSTS, {
      where: {
        title: { startsWith: "Alpha" },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.findManyPost).toHaveLength(1);
    expect(result.data?.findManyPost[0].title).toBe("Alpha Tech Post");

    const resultInsensitive = await client.query<{ findManyPost: { title: string }[] }>(
      FIND_POSTS,
      {
        where: {
          title: { istartsWith: "alpha" },
        },
      }
    );
    expect(resultInsensitive.error).toBeUndefined();
    expect(resultInsensitive.data?.findManyPost).toHaveLength(1);
    expect(resultInsensitive.data?.findManyPost[0].title).toBe("Alpha Tech Post");
  });

  it("should filter by endsWith operator", async () => {
    const result = await client.query<{ findManyPost: { title: string }[] }>(FIND_POSTS, {
      where: {
        title: { endsWith: "Ending" },
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.findManyPost).toHaveLength(1);
    expect(result.data?.findManyPost[0].title).toBe("Delta Ending");
  });

  it("should filter by notContains operator", async () => {
    const result = await client.query<{ findManyPost: { title: string }[] }>(FIND_POSTS, {
      where: {
        title: { notContains: "Tech" },
      },
    });

    expect(result.error).toBeUndefined();
    const titles = result.data?.findManyPost.map((p) => p.title);
    expect(titles).not.toContain("Alpha Tech Post");
    expect(titles).toContain("Beta Science Article");
  });

  it("should work within nested relation filters", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const result = await client.query<{ findManyPost: { author: { name: string } }[] }>(
      FIND_POSTS,
      {
        where: {
          author: {
            name: { icontains: author.name.slice(0, 3) },
          },
        },
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.findManyPost.length).toBeGreaterThan(0);
  });
});
