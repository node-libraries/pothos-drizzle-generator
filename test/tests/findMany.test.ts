import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import { createClient } from "../libs/test-tools";

export const { app, client } = createClient({
  relations,
  pothosDrizzleGenerator: {},
});

const query = gql`
  fragment post on Post {
    id
    published
    title
    content
    authorId
    createdAt
    updatedAt
    publishedAt
  }

  fragment user on User {
    id
    email
    name
    roles
    createdAt
    updatedAt
  }
  query FindManyUser(
    $offset: Int
    $limit: Int
    $where: UserWhere
    $orderBy: [UserOrderBy!]
    $postsCountWhere: PostWhere
    $postsOffset: Int
    $postsLimit: Int
    $postsWhere: PostWhere
    $postsOrderBy: [PostOrderBy!]
  ) {
    findManyUser(
      offset: $offset
      limit: $limit
      where: $where
      orderBy: $orderBy
    ) {
      ...user
      postsCount(where: $postsCountWhere)
      posts(
        offset: $postsOffset
        limit: $postsLimit
        where: $postsWhere
        orderBy: $postsOrderBy
      ) {
        ...post
      }
    }
  }
`;

describe("findMany", () => {
  it("sorts array in ascending order by user name", async () => {
    const result = await client.query(query, {
      orderBy: [{ name: "Asc" }],
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
  });

  it("sorts array in descending order by user name", async () => {
    const result = await client.query(query, {
      orderBy: [{ name: "Desc" }, { id: "Asc" }],
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
  });
  it("limit desc", async () => {
    const result = await client.query(query, {
      orderBy: { name: "Desc" },
      limit: 3,
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
  });
  it("limit asc", async () => {
    const result = await client.query(query, {
      orderBy: { name: "Asc" },
      limit: 3,
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
  });

  it("filters users by email using eq operator", async () => {
    const result = await client.query(query, {
      where: { email: { eq: "user1@example.com" } },
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
    if (users.length > 0) {
      expect(users[0].email).toBe("user1@example.com");
    }
  });

  it("filters users with AND condition (name and email)", async () => {
    const result = await client.query(query, {
      where: {
        AND: [{ name: { ilike: "A%" } }, { roles: { arrayContains: "ADMIN" } }],
      },
    });
    expect(result.data.findManyUser).toMatchSnapshot();
  });

  it("filters related posts within findManyUser", async () => {
    const result = await client.query(query, {
      postsWhere: {
        published: { eq: true },
      },
    });

    const users = result.data.findManyUser;
    expect(users).toMatchSnapshot();
    users.forEach((user: { posts: { published: boolean }[] }) => {
      user.posts.forEach((post: { published: boolean }) => {
        expect(post.published).toBe(true);
      });
    });
  });

  it("filters users by roles using arrayContains", async () => {
    const result = await client.query(query, {
      where: {
        roles: { arrayContains: ["ADMIN"] },
      },
    });

    expect(result.data.findManyUser).toMatchSnapshot();
  });

  it("filters users using NOT condition", async () => {
    const result = await client.query(query, {
      where: {
        NOT: { name: { ilike: "A%" } },
      },
    });

    expect(result.data.findManyUser).toMatchSnapshot();
  });
});

describe("findMany - customize", async () => {
  it("input throw", async () => {
    const { client } = createClient({
      relations,
      pothosDrizzleGenerator: {
        all: {
          inputData: () => {
            throw new Error("No permission");
          },
        },
      },
    });
    const result = await client.query(query, {
      postsWhere: {
        published: { eq: true },
      },
    });
    expect(result.data.findManyUser).not.toBeNull();
  });
});
