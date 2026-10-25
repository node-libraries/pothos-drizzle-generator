import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { clearLogs, createClient, filterObject, getLogs, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});


const DELETE_POST_WITH_RELATIONS = gql`
  fragment category on Category {
    id
    name
  }

  fragment post on Post {
    id
    published
    title
    content
    authorId
  }

  fragment user on User {
    id
    name
  }

  mutation DeletePost($where: PostWhere) {
    deletePost(where: $where) {
      ...post
      author {
        ...user
      }
      categories {
        ...category
      }
      categoriesCount
    }
  }
`;

const DELETE_POST_SIMPLE = gql`
  mutation DeletePost($where: PostWhere) {
    deletePost(where: $where) {
      id
      title
    }
  }
`;
const DELETE_POST_EMPTY = gql`
  mutation DeletePost($where: PostWhere) {
    deletePost(where: $where) {
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
  categories?: { id: string; name: string }[];
}

describe("Mutation: deletePost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  beforeAll(async () => {
    await db.resetSchema();
  });
  afterAll(async () => {
    await db.dropSchema();
  });
  it("should delete a post and return an array using object-based where clause", async () => {
    
    const targetPost = await db.query.posts.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    clearLogs(db);

    const result = await client.mutation<{ deletePost: PostResponse[] }>(
      DELETE_POST_WITH_RELATIONS,
      {
        where: {
          id: { eq: targetPost?.id },
        },
      }
    );

    expect(result.error).toBeUndefined();
    const data = result.data?.deletePost;

    if (!data) throw new Error("Delete operation failed");

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(filterObject(data[0], IGNORED_KEYS)).toMatchSnapshot();
    expect(getLogs(db).length).toBe(4);
    
    const dbRecord = await db.query.posts.findFirst({
      where: {
        id: { eq: targetPost!.id },
      },
    });
    expect(dbRecord).toBeUndefined();
  });

  it("should delete multiple posts using 'in' operator in the where object", async () => {
    const targetPosts = await db.query.posts.findMany({ limit: 2 });
    const targetIds = targetPosts.map((p) => p.id);

    const result = await client.mutation<{ deletePost: PostResponse[] }>(DELETE_POST_SIMPLE, {
      where: {
        id: { in: targetIds },
      },
    });

    const data = result.data?.deletePost;
    if (!data) throw new Error("Batch delete failed");

    expect(data.length).toBeGreaterThanOrEqual(targetIds.length);

    
    const remainingCount = await db.query.posts.findMany({
      where: {
        id: { in: targetIds },
      },
    });
    expect(remainingCount).toHaveLength(0);
  });

  it("should delete multiple posts using 'in' operator in the where object2", async () => {
    const targetPosts = await db.query.posts.findMany({ limit: 2 });
    const targetIds = targetPosts.map((p) => p.id);

    const result = await client.mutation<{ deletePost: PostResponse[] }>(DELETE_POST_EMPTY, {
      where: {
        id: { in: targetIds },
      },
    });

    const data = result.data?.deletePost;
    if (!data) throw new Error("Batch delete failed");

    expect(data.length).toBeGreaterThanOrEqual(targetIds.length);

    
    const remainingCount = await db.query.posts.findMany({
      where: {
        id: { in: targetIds },
      },
    });
    expect(remainingCount).toHaveLength(0);
  });

  it("should delete multiple posts using 'in' operator in the where false", async () => {
    const result = await client.mutation<{ deletePost: PostResponse[] }>(DELETE_POST_EMPTY, {
      where: {
        id: { isNull: true },
      },
    });

    const data = result.data?.deletePost;
    if (!data) throw new Error("Batch delete failed");

    expect(data).toHaveLength(0);
  });

  it("should handle deletion using non-id unique fields", async () => {
    const targetPost = await db.query.posts.findFirst();
    const targetTitle = targetPost?.title;

    const result = await client.mutation<{ deletePost: PostResponse[] }>(DELETE_POST_SIMPLE, {
      where: {
        title: { eq: targetTitle },
      },
    });

    const data = result.data?.deletePost;
    if (!data || data.length === 0) throw new Error("Delete by title failed");

    expect(data[0].id).toBe(targetPost?.id);

    const dbCheck = await db.query.posts.findFirst({
      where: {
        title: { eq: targetTitle },
      },
    });
    expect(dbCheck).toBeUndefined();
  });

  it("should return an empty array when trying to delete a non-existent record", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const result = await client.mutation<{ deletePost: PostResponse[] }>(DELETE_POST_SIMPLE, {
      where: {
        id: { eq: nonExistentId },
      },
    });

    expect(result.data?.deletePost).toHaveLength(0);
  });
  it("should delete posts filtering by relation in where clause", async () => {
    const { users, posts } = await import("../db/schema");
    const [tempUser] = await db.insert(users).values({
      email: "temp-delete-rel@example.com",
      name: "Temp Delete",
    }).returning();
    const [tempPost] = await db.insert(posts).values({
      title: "Temp Post For Rel Delete",
      authorId: tempUser.id,
    }).returning();

    const DELETE_POST_REL = gql`
      mutation DeletePostRel($where: PostWhere) {
        deletePost(where: $where) {
          id
          title
        }
      }
    `;

    const result = await client.mutation<{ deletePost: { id: string; title: string }[] }>(
      DELETE_POST_REL,
      {
        where: {
          author: { email: { eq: "temp-delete-rel@example.com" } },
        },
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.deletePost).toHaveLength(1);
    expect(result.data?.deletePost[0].id).toBe(tempPost.id);

    const check = await db.query.posts.findFirst({
      where: { id: { eq: tempPost.id } },
    });
    expect(check).toBeUndefined();
  });
});
