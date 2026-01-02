import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import {
  clearLogs,
  createClient,
  filterObject,
  getLogs,
} from "../libs/test-tools";

export const { app, client, db } = createClient({
  relations,
  pothosDrizzleGenerator: {},
});

/**
 * GraphQL Mutation 定義
 * createManyPost は作成されたレコードの配列を返す仕様
 */
const CREATE_MANY_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  mutation CreateManyPost($input: [PostCreate!]!) {
    createManyPost(input: $input) {
      ...post
    }
  }
`;

interface PostResponse {
  id: string;
  title: string;
  content: string;
  published: boolean;
  authorId: string;
}

describe("Mutation: createManyPost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  it("should create multiple posts and return an array of created records", async () => {
    const author = await db.query.users.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    if (!author) throw new Error("Author not found for testing");

    clearLogs(db);

    const input = [
      {
        title: "Bulk Post 1",
        content: "Content 1",
        authorId: author.id,
        published: true,
      },
      {
        title: "Bulk Post 2",
        content: "Content 2",
        authorId: author.id,
        published: false,
      },
    ];

    const result = await client.mutation<{ createManyPost: PostResponse[] }>(
      CREATE_MANY_POST,
      {
        input,
      }
    );
    expect(getLogs(db).length).toBe(3);
    expect(result.error).toBeUndefined();
    const data = result.data?.createManyPost;

    if (!data) throw new Error("Mutation result data is missing");

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);

    // スナップショットの検証（IDや日付を除外）
    expect(
      data.map((post) => filterObject(post, IGNORED_KEYS))
    ).toMatchSnapshot();

    // DB側に正しく保存されているかオブジェクト形式で検証
    const savedPosts = await db.query.posts.findMany({
      where: {
        title: { in: ["Bulk Post 1", "Bulk Post 2"] },
      },
    });
    expect(savedPosts).toHaveLength(2);
  });

  // --- 追加テストケース ---

  it("should return an empty array when input is an empty list", async () => {
    const result = await client.mutation<{ createManyPost: PostResponse[] }>(
      CREATE_MANY_POST,
      {
        input: [],
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.createManyPost).toHaveLength(0);
  });

  it("should create records with unique titles and verify using object-based filtering", async () => {
    const author = await db.query.users.findFirst();
    const uniqueBatchToken = `batch-${Date.now()}`;

    const input = [
      {
        title: `${uniqueBatchToken}-1`,
        content: "Unique Content",
        published: true,
        authorId: author!.id,
      },
    ];

    const result = await client.mutation<{ createManyPost: PostResponse[] }>(
      CREATE_MANY_POST,
      {
        input,
      }
    );

    const createdId = result.data?.createManyPost[0].id;

    // 作成されたレコードをオブジェクト形式の where で再取得
    const verified = await db.query.posts.findFirst({
      where: {
        id: { eq: createdId },
        title: { eq: `${uniqueBatchToken}-1` },
      },
    });
    expect(verified).toBeDefined();
    expect(verified?.title).toBe(`${uniqueBatchToken}-1`);
  });
});
