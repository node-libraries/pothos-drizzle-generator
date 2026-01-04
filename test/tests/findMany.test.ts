import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { postsToCategories } from "../db/schema";
import { createClient, filterObject, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

/**
 * GraphQL Query 定義
 * オペレーション名を findManyPost に統一
 */
const FIND_MANY_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }
  fragment user on User {
    id
    email
    name
    roles
    createdAt
    updatedAt
  }
  fragment category on Category {
    id
    name
    createdAt
    updatedAt
  }
  query FindManyPost(
    $offset: Int
    $limit: Int
    $where: PostWhere
    $orderBy: [PostOrderBy!]
    $authorCountWhere: UserWhere
    $categoriesCountWhere: CategoryWhere
    $authorOffset: Int
    $authorLimit: Int
    $authorWhere: UserWhere
    $authorOrderBy: [UserOrderBy!]
    $categoriesOffset: Int
    $categoriesLimit: Int
    $categoriesWhere: CategoryWhere
    $categoriesOrderBy: [CategoryOrderBy!]
  ) {
    findManyPost(offset: $offset, limit: $limit, where: $where, orderBy: $orderBy) {
      ...post
      authorCount(where: $authorCountWhere)
      categoriesCount(where: $categoriesCountWhere)
      author(
        offset: $authorOffset
        limit: $authorLimit
        where: $authorWhere
        orderBy: $authorOrderBy
      ) {
        ...user
      }
      categories(
        offset: $categoriesOffset
        limit: $categoriesLimit
        where: $categoriesWhere
        orderBy: $categoriesOrderBy
      ) {
        ...category
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

describe("Query: findManyPost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  beforeAll(async () => {
    await db.resetSchema();
  });
  afterAll(async () => {
    await db.dropSchema();
  });
  it("should retrieve posts using object-based where clause", async () => {
    // Drizzle v2: 純粋なオブジェクトによる取得
    const allPosts = await db.query.posts.findMany({
      limit: 5,
      where: {
        id: { isNotNull: true },
      },
    });

    if (allPosts.length === 0) throw new Error("No posts found in database");

    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      where: {
        id: { in: allPosts.map((p) => p.id) },
      },
      orderBy: [{ title: "Asc" }],
    });

    expect(result.error).toBeUndefined();
    const data = result.data?.findManyPost;

    if (!data) throw new Error("Query result data is missing");

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(allPosts.length);
    expect(filterObject(data[0], IGNORED_KEYS)).toMatchSnapshot();
  });

  it("should filter posts by published status using pure object syntax", async () => {
    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      where: {
        published: { eq: true },
      },
    });

    const data = result.data?.findManyPost;
    if (!data) throw new Error("No data returned");

    data.forEach((post) => {
      expect(post.published).toBe(true);
    });
  });

  it("should handle pagination with limit and offset", async () => {
    const limit = 2;
    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      limit,
      offset: 0,
      orderBy: [{ createdAt: "Desc" }],
    });

    expect(result.data?.findManyPost.length).toBeLessThanOrEqual(limit);
  });

  it("should handle complex 'and' conditions via object keys", async () => {
    const targetPost = await db.query.posts.findFirst();
    if (!targetPost) throw new Error("Data required");

    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      where: {
        authorId: { eq: targetPost.authorId },
        published: { eq: targetPost.published },
      },
    });

    const data = result.data?.findManyPost;
    expect(
      data?.every((p) => p.authorId === targetPost.authorId && p.published === targetPost.published)
    ).toBe(true);
  });

  it("should return an empty array for non-matching pure object criteria", async () => {
    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      where: {
        title: { eq: "NON_EXISTENT_TITLE_UNIQUE_999" },
      },
    });

    expect(result.data?.findManyPost).toHaveLength(0);
  });

  it("should filter by multiple IDs using 'in' operator in object", async () => {
    const targetPosts = await db.query.posts.findMany({ limit: 2 });
    const targetIds = targetPosts.map((p) => p.id);

    const result = await client.query<{ findManyPost: PostResponse[] }>(FIND_MANY_POST, {
      where: {
        id: { in: targetIds },
      },
    });

    expect(result.data?.findManyPost).toHaveLength(targetIds.length);
    result.data?.findManyPost.forEach((post) => {
      expect(targetIds).toContain(post.id);
    });
  });
});
describe("findMany - customize", async () => {
  beforeAll(async () => {
    await db.resetSchema();
  });
  afterAll(async () => {
    await db.dropSchema();
  });
  it("input throw", async () => {
    const { client } = createClient({
      searchPath: getSearchPath(import.meta.url),
      relations,
      pothosDrizzleGenerator: {
        all: {
          inputData: () => {
            throw new Error("No permission");
          },
          limit: () => 2,
        },
      },
    });
    const categories = await db.query.categories.findMany();
    const posts = await db.query.posts.findMany();
    await db
      .insert(postsToCategories)
      .values(posts.flatMap((p) => categories.map((c) => ({ postId: p.id, categoryId: c.id }))))
      .onConflictDoNothing();
    await client.query(FIND_MANY_POST, { limit: 4 }).then((result) => {
      expect(result.data.findManyPost).toHaveLength(2);
      expect(result.data.findManyPost[0].categories).toHaveLength(2);
    });
    await client.query(FIND_MANY_POST, { limit: 1, categoriesLimit: 1 }).then((result) => {
      expect(result.data.findManyPost).toHaveLength(1);
      expect(result.data.findManyPost[0].categories).toHaveLength(1);
    });
  });
});
