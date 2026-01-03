import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import { createClient } from "../libs/test-tools";

export const { app, client, db } = createClient({
  relations,
  pothosDrizzleGenerator: {},
});

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

const FIND_FIRST_POST2 = gql`
  query FindFirstPost($where: PostWhere, $orderBy: [PostOrderBy!]) {
    findFirstPost(where: $where, orderBy: $orderBy) {
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

const FIND_FIRST_POST3 = gql`
  query FindFirstPost($where: PostWhere, $orderBy: [PostOrderBy!]) {
    findFirstPost(where: $where, orderBy: $orderBy) {
      __typename
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

describe("Query: findFirstPost (Drizzle v2 Pure Object Syntax)", () => {
  it("should retrieve a first post using object-based where clause", async () => {
    // 準備: テスト用のデータをDBから直接取得 (Drizzle v2 オブジェクト形式)
    const targetPost = await db.query.posts.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    if (!targetPost) throw new Error("No posts found in database");

    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST, {
      where: {
        id: { eq: targetPost.id },
      },
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.findFirstPost;

    if (!data) throw new Error("Query result data is missing");

    expect(data.id).toBe(targetPost.id);
    expect(data.title).toBe(targetPost.title);
    expect(data.author).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
  });

  it("should return the first record matching a specific non-id condition", async () => {
    // 準備: 特定のタイトルを持つデータを取得
    const targetPost = await db.query.posts.findFirst({
      where: {
        published: { eq: true },
      },
    });

    if (!targetPost) throw new Error("No published posts found");

    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST, {
      where: {
        published: { eq: true },
      },
      orderBy: [{ createdAt: "Desc" }],
    });

    expect(result.data?.findFirstPost.published).toBe(true);
  });

  // --- 追加テストケース ---

  it("should handle complex object filtering with multiple fields", async () => {
    const targetPost = await db.query.posts.findFirst();
    if (!targetPost) throw new Error("Data required");

    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST, {
      where: {
        id: { eq: targetPost.id },
        title: { eq: targetPost.title },
        published: { eq: targetPost.published },
      },
    });

    expect(result.data?.findFirstPost.id).toBe(targetPost.id);
  });

  it("empty fields", async () => {
    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST2, {});
    expect(result.data?.findFirstPost).toBeDefined();
    const result2 = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST3, {});
    expect(result2.data?.findFirstPost).toBeDefined();
  });

  it("should return null when no record matches the pure object criteria", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const result = await client.query<{ findFirstPost: PostResponse | null }>(FIND_FIRST_POST, {
      where: {
        id: { eq: nonExistentId },
      },
    });

    // findFirst は該当なしの場合 null を返す
    expect(result.data?.findFirstPost).toBeNull();
  });

  it("should retrieve a post with relation filtering in the where object", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const result = await client.query<{ findFirstPost: PostResponse }>(FIND_FIRST_POST, {
      where: {
        authorId: { eq: author.id },
      },
    });

    expect(result.data?.findFirstPost.authorId).toBe(author.id);
    expect(result.data?.findFirstPost.author.id).toBe(author.id);
  });
});
