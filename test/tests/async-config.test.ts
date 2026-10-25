import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, getSearchPath } from "../libs/test-tools";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FIND_POSTS = gql`
  query FindPosts($where: PostWhere, $limit: Int) {
    findManyPost(where: $where, limit: $limit) {
      id
      title
      content
      authorId
    }
  }
`;

const CREATE_POST = gql`
  mutation CreatePost($input: PostCreate!) {
    createOnePost(input: $input) {
      id
      title
      content
      authorId
    }
  }
`;

describe("Async Configuration Callbacks (executable, where, inputData, limit)", () => {
  let authorId = "";
  let activeFilterTitle: string | undefined = undefined;
  let activeLimit: number | undefined = undefined;

  const { client, db } = createClient({
    searchPath: getSearchPath(import.meta.url),
    relations,
    pothosDrizzleGenerator: {
      models: {
        posts: {
          executable: async ({ operation }) => {
            await delay(10);
            if (operation === "delete") {
              return false;
            }
            return true;
          },
          where: async () => {
            await delay(10);
            return activeFilterTitle ? { title: { eq: activeFilterTitle } } : undefined;
          },
          inputData: async () => {
            await delay(10);
            return {
              content: "Auto-Injected Async Content",
            };
          },
          limit: async () => {
            await delay(10);
            return activeLimit;
          },
        },
      },
    },
  });

  beforeAll(async () => {
    await db.resetSchema();
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");
    authorId = author.id;
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should enforce async executable callback", async () => {
    const DELETE_POST = gql`
      mutation DeletePost($where: PostWhere) {
        deletePost(where: $where) {
          id
        }
      }
    `;

    const resultDenied = await client.mutation(DELETE_POST, { where: {} });
    expect(resultDenied.error?.message).toContain("No permission");
  });

  it("should apply async where filter", async () => {
    activeFilterTitle = "Async Search Target";
    // Create matching post
    await client.mutation(CREATE_POST, {
      input: {
        title: "Async Search Target",
        authorId,
      },
    });

    const result = await client.query<{ findManyPost: { id: string; title: string }[] }>(
      FIND_POSTS,
      {}
    );

    expect(result.error).toBeUndefined();
    const posts = result.data?.findManyPost;
    expect(posts?.length).toBeGreaterThan(0);
    posts?.forEach((post) => {
      expect(post.title).toBe("Async Search Target");
    });
    activeFilterTitle = undefined;
  });

  it("should apply async inputData on mutation", async () => {
    const result = await client.mutation<{
      createOnePost: { id: string; title: string; content: string };
    }>(CREATE_POST, {
      input: {
        title: "Post with Async InputData",
        authorId,
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.createOnePost.content).toBe("Auto-Injected Async Content");
  });

  it("should apply async limit", async () => {
    activeLimit = 1;
    const result = await client.query<{ findManyPost: unknown[] }>(FIND_POSTS, {});
    expect(result.error).toBeUndefined();
    expect(result.data?.findManyPost).toHaveLength(1);
    activeLimit = undefined;
  });
});
