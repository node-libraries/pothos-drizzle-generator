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

const query = gql`
  fragment category on Category {
    id
    name
    createdAt
    updatedAt
  }

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

  mutation DeletePost(
    $where: PostWhere
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
    deletePost(where: $where) {
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

const query2 = gql`
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
  mutation DeletePost($where: PostWhere) {
    deletePost(where: $where) {
      ...post
    }
  }
`;

describe("delete", () => {
  it("delete", async () => {
    const post = await db.query.posts.findFirst();
    clearLogs(db);
    const result = await client.mutation(query, {
      where: {
        id: { eq: post?.id },
      },
    });
    expect(
      filterObject(result.data, ["id", "createdAt", "updatedAt", "publishedAt"])
    ).toMatchSnapshot();
    expect(getLogs(db).length).toBe(2);
  });

  it("delete no relay", async () => {
    const post = await db.query.posts.findFirst();
    clearLogs(db);
    const result = await client.mutation(query2, {
      where: {
        id: { eq: post?.id },
      },
    });
    expect(
      filterObject(result.data, ["id", "createdAt", "updatedAt", "publishedAt"])
    ).toMatchSnapshot();
    expect(getLogs(db).length).toBe(1);
  });
});
