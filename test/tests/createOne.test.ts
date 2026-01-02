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
 */
const CREATE_ONE_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      ...post
      author {
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
}

describe("Mutation: createOnePost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  it("should create a single post with non-null fields and return the created record", async () => {
    // Drizzle v2: 純粋なオブジェクトによる取得
    const author = await db.query.users.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    if (!author) throw new Error("Author not found for testing");

    clearLogs(db);

    const input = {
      title: "New Single Post",
      content: "Required Content Body",
      authorId: author.id,
      published: true,
    };

    const result = await client.mutation<{ createOnePost: PostResponse }>(
      CREATE_ONE_POST,
      {
        input,
      }
    );
    expect(getLogs(db).length).toBe(4);
    expect(result.error).toBeUndefined();
    const createdPost = result.data?.createOnePost;

    if (!createdPost) throw new Error("Mutation result data is missing");

    // スナップショット検証（IDや日付を除外）
    expect(filterObject(createdPost, IGNORED_KEYS)).toMatchSnapshot();
    expect(createdPost.author.id).toBe(author.id);

    // DB側に正しく保存されているかオブジェクト形式で検証
    const savedPost = await db.query.posts.findFirst({
      where: {
        id: { eq: createdPost.id },
      },
    });

    expect(savedPost).toBeDefined();
    expect(savedPost?.title).toBe("New Single Post");
    expect(savedPost?.content).toBe("Required Content Body");
    expect(savedPost?.published).toBe(true);
  });

  // --- 追加テストケース ---

  it("should create a post and verify it with complex object filtering", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const uniqueTitle = `unique-${Date.now()}`;

    const result = await client.mutation<{ createOnePost: PostResponse }>(
      CREATE_ONE_POST,
      {
        input: {
          title: uniqueTitle,
          content: "Mandatory Content",
          authorId: author.id,
          published: false,
        },
      }
    );

    const createdPost = result.data?.createOnePost;
    if (!createdPost) throw new Error("Post creation failed");

    // 複数の条件を組み合わせたオブジェクト形式の where で再取得
    const verified = await db.query.posts.findFirst({
      where: {
        id: { eq: createdPost.id },
        title: { eq: uniqueTitle },
        published: { eq: false },
      },
    });

    expect(verified).toBeDefined();
    expect(verified?.id).toBe(createdPost.id);
  });

  it("should return an error when required fields are missing (Schema Validation)", async () => {
    // content や published が欠落している場合、GraphQLレベルでエラーになることを期待
    const result = await client.mutation(CREATE_ONE_POST, {
      input: {
        title: "Incomplete Post",
        // content と published が欠落
      },
    });

    expect(result.error).toBeDefined();
  });
});
