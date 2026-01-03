import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import { clearLogs, createClient, filterObject, getLogs } from "../libs/test-tools";

export const { app, client, db } = createClient({
  relations,
  pothosDrizzleGenerator: {},
});

const UPDATE_POST_FULL = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  mutation UpdatePost($input: PostUpdate!, $where: PostWhere) {
    updatePost(input: $input, where: $where) {
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

const UPDATE_POST_SIMPLE = gql`
  mutation UpdatePost($input: PostUpdate!, $where: PostWhere) {
    updatePost(input: $input, where: $where) {
      id
      title
    }
  }
`;

const UPDATE_POST_EMPTY = gql`
  mutation UpdatePost($input: PostUpdate!, $where: PostWhere) {
    updatePost(input: $input, where: $where) {
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

describe("Mutation: updatePost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  it("should update a post and return an array using object-based where clause", async () => {
    const targetPost = await db.query.posts.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    clearLogs(db);

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_FULL, {
      input: { title: "Drizzle v2 Object Title" },
      where: {
        id: { eq: targetPost?.id },
      },
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.updatePost;

    if (!data) throw new Error("Data not found");

    expect(Array.isArray(data)).toBe(true);
    expect(filterObject(data[0], IGNORED_KEYS)).toMatchSnapshot();
    expect(getLogs(db).length).toBeGreaterThan(0);
  });

  it("should update relations and verify results in the returned array", async () => {
    const categories = await db.query.categories.findMany({
      limit: 1,
    });

    const targetPost = await db.query.posts.findFirst();
    clearLogs(db);

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_FULL, {
      input: {
        title: "Updated with Object Syntax",
        categories: { set: categories.map((c) => ({ id: c.id })) },
      },
      where: {
        id: { eq: targetPost?.id },
      },
    });

    const updatedPost = result.data?.updatePost[0];
    expect(updatedPost?.categories).toHaveLength(categories.length);
    expect(updatedPost?.title).toBe("Updated with Object Syntax");

    const dbRecord = await db.query.posts.findFirst({
      where: {
        id: { eq: targetPost!.id },
      },
    });
    expect(dbRecord?.title).toBe("Updated with Object Syntax");
  });

  it("should handle multi-field updates and verify the first element of the result array", async () => {
    const targetPost = await db.query.posts.findFirst();
    const newContent = "Updated content via pure object syntax";

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { content: newContent },
      where: {
        id: { eq: targetPost?.id },
        published: { eq: targetPost?.published },
      },
    });

    const data = result.data?.updatePost;
    expect(data).toHaveLength(1);
    expect(data?.[0].id).toBe(targetPost?.id);

    const verified = await db.query.posts.findFirst({
      where: {
        id: { eq: targetPost!.id },
        content: { eq: newContent },
      },
    });
    expect(verified?.content).toBe(newContent);
  });

  it("should update multiple records and return them as an array", async () => {
    const targetPosts = await db.query.posts.findMany({ limit: 2 });
    const commonContent = "Batch update content";

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { content: commonContent },
      where: {
        id: { in: targetPosts.map((p) => p.id) },
      },
    });

    const data = result.data?.updatePost;
    if (!data) throw new Error("Batch update failed");

    expect(data.length).toBeGreaterThanOrEqual(targetPosts.length);
    data.forEach((post) => {
      expect(targetPosts.map((p) => p.id)).toContain(post.id);
    });
  });

  it("should update multiple records and return only the requested fields (empty field list)", async () => {
    const targetPosts = await db.query.posts.findMany({ limit: 2 });
    const commonContent = "Batch update content";

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_EMPTY, {
      input: { content: commonContent },
      where: {
        id: { in: targetPosts.map((p) => p.id) },
      },
    });

    const data = result.data?.updatePost;
    if (!data) throw new Error("Batch update failed");

    expect(data.length).toBeGreaterThanOrEqual(targetPosts.length);
  });

  it("should return an empty array when no record matches the where criteria", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: "No Match" },
      where: {
        id: { eq: nonExistentId },
      },
    });

    expect(Array.isArray(result.data?.updatePost)).toBe(true);
    expect(result.data?.updatePost).toHaveLength(0);
  });

  it("should update records using OR condition in the where clause", async () => {
    const posts = await db.query.posts.findMany({ limit: 2 });
    if (posts.length < 2) throw new Error("Need at least 2 posts for this test");

    const newTitle = "Updated with OR";
    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: newTitle },
      where: {
        OR: [{ id: { eq: posts[0].id } }, { id: { eq: posts[1].id } }],
      },
    });

    const data = result.data?.updatePost;
    expect(data?.length).toBeGreaterThanOrEqual(2);
    data?.forEach((post) => {
      expect(post.title).toBe(newTitle);
    });
  });

  it("should update records using NOT condition in the where clause", async () => {
    const targetPost = await db.query.posts.findFirst();
    const otherPosts = await db.query.posts.findMany({
      where: {
        id: { ne: targetPost!.id },
      },
      limit: 1,
    });
    if (otherPosts.length === 0) throw new Error("Need other posts for this test");

    const newTitle = "Updated with NOT";
    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: newTitle },
      where: {
        NOT: { id: { eq: targetPost?.id } },
        id: { eq: otherPosts[0].id },
      },
    });

    const data = result.data?.updatePost;
    expect(data).toHaveLength(1);
    expect(data?.[0].id).toBe(otherPosts[0].id);
    expect(data?.[0].title).toBe(newTitle);

    const checkTarget = await db.query.posts.findFirst({
      where: {
        id: { eq: targetPost!.id },
      },
    });
    expect(checkTarget?.title).not.toBe(newTitle);
  });

  it("should ignore empty OR array and treat it as no condition", async () => {
    const targetPost = await db.query.posts.findFirst();
    const newTitle = "Updated with empty OR";
    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: newTitle },
      where: {
        id: { eq: targetPost?.id },
        OR: [],
      },
    });

    const data = result.data?.updatePost;
    expect(data).toHaveLength(1);
    expect(data?.[0].title).toBe(newTitle);
  });

  it("should ignore null NOT condition", async () => {
    const targetPost = await db.query.posts.findFirst();
    const newTitle = "Updated with null NOT";
    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: newTitle },
      where: {
        id: { eq: targetPost?.id },
        NOT: null,
      },
    });

    const data = result.data?.updatePost;
    expect(data).toHaveLength(1);
    expect(data?.[0].title).toBe(newTitle);
  });

  it("should update all records when an empty where object is provided", async () => {
    const allPosts = await db.query.posts.findMany();
    const newTitle = "Updated all posts";

    const result = await client.mutation<{ updatePost: PostResponse[] }>(UPDATE_POST_SIMPLE, {
      input: { title: newTitle },
      where: {},
    });

    const data = result.data?.updatePost;
    expect(data?.length).toBe(allPosts.length);
    data?.forEach((post) => {
      expect(post.title).toBe(newTitle);
    });
  });
});
