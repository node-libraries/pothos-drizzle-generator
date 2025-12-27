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
  query FindFirstUser(
    $offset: Int
    $where: UserWhere
    $orderBy: [UserOrderBy!]
    $postsCountWhere: PostWhere
    $postsOffset: Int
    $postsLimit: Int
    $postsWhere: PostWhere
    $postsOrderBy: [PostOrderBy!]
  ) {
    findFirstUser(offset: $offset, where: $where, orderBy: $orderBy) {
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

describe("findFirst", () => {
  it("sorts array in ascending order by user name", async () => {
    const result = await client.query(query, {
      orderBy: [{ name: "Asc" }],
    });

    const user = result.data.findFirstUser;
    expect(user).toBeDefined();
    expect(user).toMatchSnapshot();
  });

  it("sorts array in descending order by user name", async () => {
    const result = await client.query(query, {
      orderBy: [{ name: "Desc" }, { id: "Asc" }],
    });

    const user = result.data.findFirstUser;
    expect(user).toBeDefined();
    expect(user).toMatchSnapshot();
  });
});
