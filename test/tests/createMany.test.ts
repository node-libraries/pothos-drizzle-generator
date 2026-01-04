import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { clearLogs, createClient, filterObject, getLogs, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
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

const CREATE_MANY_POST2 = gql`
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
      categories {
        __typename
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
}

describe("Mutation: createManyPost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  beforeAll(async () => {
    await db.resetSchema();
  });

  afterAll(async () => {
    await db.dropSchema();
  });

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

    const result = await client.mutation<{ createManyPost: PostResponse[] }>(CREATE_MANY_POST, {
      input,
    });
    expect(getLogs(db).length).toBe(3);
    expect(result.error).toBeUndefined();
    const data = result.data?.createManyPost;

    if (!data) throw new Error("Mutation result data is missing");

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);

    // スナップショットの検証（IDや日付を除外）
    expect(data.map((post) => filterObject(post, IGNORED_KEYS))).toMatchSnapshot();

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
    const result = await client.mutation<{ createManyPost: PostResponse[] }>(CREATE_MANY_POST, {
      input: [],
    });

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

    const result = await client.mutation<{ createManyPost: PostResponse[] }>(CREATE_MANY_POST, {
      input,
    });

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

  it("should return only __typename for each created post when requested", async () => {
    const TYPENAME_ONLY_QUERY = gql`
      mutation CreateManyPostTypename($input: [PostCreate!]!) {
        createManyPost(input: $input) {
          __typename
        }
      }
    `;

    const author = await db.query.users.findFirst();
    const input = [
      {
        title: "Typename only test",
        content: "Content",
        authorId: author!.id,
        published: true,
      },
    ];

    const result = await client.mutation<{ createManyPost: { __typename: string }[] }>(
      TYPENAME_ONLY_QUERY,
      {
        input,
      }
    );

    expect(result.error).toBeUndefined();
    const data = result.data?.createManyPost;
    expect(data).toHaveLength(1);
    expect(data?.[0]).toEqual({ __typename: "Post" });
  });

  it("should return __typename for relation (author) when requested", async () => {
    const RELATION_TYPENAME_QUERY = gql`
      mutation CreateManyPostRelationTypename($input: [PostCreate!]!) {
        createManyPost(input: $input) {
          author {
            __typename
          }
        }
      }
    `;

    const author = await db.query.users.findFirst();
    const input = [
      {
        title: "Relation typename test",
        content: "Content",
        authorId: author!.id,
        published: true,
      },
    ];

    const result = await client.mutation<{
      createManyPost: { author: { __typename: string } }[];
    }>(RELATION_TYPENAME_QUERY, {
      input,
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.createManyPost;
    expect(data).toHaveLength(1);
    expect(data?.[0].author).toEqual({ __typename: "User" });
  });

  it("should create a post and return only relation __typename", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");
    const category = await db.query.categories.findFirst();
    if (!category) throw new Error("Category required");
    const result = await client.mutation<{
      createManyPost: { categories: [{ __typename: string }] }[];
    }>(CREATE_MANY_POST2, {
      input: {
        title: "Only Typename",
        content: "Content",
        authorId: author.id,
        published: false,
        categories: {
          set: [{ id: category.id }],
        },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.createManyPost[0].categories[0].__typename).toBe("Category");
  });
});
