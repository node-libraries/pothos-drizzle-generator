import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, filterObject, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

const UPSERT_ONE_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  mutation UpsertOnePost($input: PostCreate!) {
    upsertOnePost(input: $input) {
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

const UPSERT_ONE_POST_SIMPLE = gql`
  mutation UpsertOnePost($input: PostCreate!) {
    upsertOnePost(input: $input) {
      id
      title
      content
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
  categories?: { id: string; name: string }[];
}

describe("Mutation: upsertOnePost", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  beforeAll(async () => {
    await db.resetSchema();
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should insert a new post when record does not exist", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author not found");

    const newId = "11111111-1111-1111-1111-111111111111";
    const result = await client.mutation<{ upsertOnePost: PostResponse }>(UPSERT_ONE_POST, {
      input: {
        id: newId,
        title: "Upsert New Post",
        content: "New Post Content",
        authorId: author.id,
        published: true,
      },
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.upsertOnePost;
    expect(data?.id).toBe(newId);
    expect(data?.title).toBe("Upsert New Post");
    expect(data?.author.id).toBe(author.id);

    const fromDb = await db.query.posts.findFirst({
      where: { id: { eq: newId } },
    });
    expect(fromDb).toBeDefined();
    expect(fromDb?.title).toBe("Upsert New Post");
  });

  it("should update existing post when primary key conflicts", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author not found");

    const existingId = "11111111-1111-1111-1111-111111111111";
    const result = await client.mutation<{ upsertOnePost: PostResponse }>(UPSERT_ONE_POST_SIMPLE, {
      input: {
        id: existingId,
        title: "Upsert Updated Title",
        content: "Updated Content",
        authorId: author.id,
        published: true,
      },
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.upsertOnePost;
    expect(data?.id).toBe(existingId);
    expect(data?.title).toBe("Upsert Updated Title");
    expect(data?.content).toBe("Updated Content");

    const fromDb = await db.query.posts.findFirst({
      where: { id: { eq: existingId } },
    });
    expect(fromDb?.title).toBe("Upsert Updated Title");
  });

  it("should handle relation associations during upsert", async () => {
    const author = await db.query.users.findFirst();
    const category = await db.query.categories.findFirst();
    if (!author || !category) throw new Error("Seed data required");

    const upsertId = "22222222-2222-2222-2222-222222222222";
    const result = await client.mutation<{ upsertOnePost: PostResponse }>(UPSERT_ONE_POST, {
      input: {
        id: upsertId,
        title: "Post with Relations",
        content: "Content",
        authorId: author.id,
        published: true,
        categories: {
          set: [{ id: category.id }],
        },
      },
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.upsertOnePost;
    expect(data?.id).toBe(upsertId);
    expect(data?.categories).toHaveLength(1);
    expect(data?.categories?.[0].id).toBe(category.id);
  });
});
