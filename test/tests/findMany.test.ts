import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import { createClient } from "../libs/test-tools";

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export const { app, client } = createClient({
  relations,
  pothosDrizzleGenerator: {},
});

describe("array sorting", () => {
  it("sorts array in ascending order by user name", async () => {
    const expectedUserNamesAsc = ["Alice", "Bob", "Charlie"]; // 仮の期待値

    const result = await client.query(
      gql`
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
      `,
      {
        orderBy: [{ name: "Asc" }],
      }
    );

    const users = result.data.findManyUser;
    expect(users).toBeDefined();
    expect(users.map((u: User) => u.name)).toMatchSnapshot();
  });

  it("sorts array in descending order by user name", async () => {
    const result = await client.query(
      gql`
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
      `,
      {
        orderBy: [{ name: "Desc" }, { id: "Asc" }],
      }
    );

    const users = result.data.findManyUser;
    expect(users).toBeDefined();
    expect(users.map((u: User) => [u.id, u.name])).toMatchSnapshot();
  });
});
