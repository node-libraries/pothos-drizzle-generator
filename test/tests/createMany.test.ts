import { gql } from "@urql/core";
import { describe, it, expect } from "vitest";
import { relations } from "../db/relations";
import { createClient, filterObject } from "../libs/test-tools";

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

  mutation CreateManyPost(
    $input: [PostCreate!]!
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
    createManyPost(input: $input) {
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

describe("createMany", () => {
  it("create", async () => {
    const user = await db.query.users.findFirst();

    const result = await client.mutation(query, {
      input: [
        {
          title: "title",
          content: "Test",
          published: true,
          authorId: user?.id,
        },
        {
          title: "title2",
          content: "Test2",
          published: false,
          authorId: user?.id,
        },
      ],
    });
    expect(
      filterObject(result.data, ["id", "createdAt", "updatedAt", "publishedAt"])
    ).toMatchSnapshot();
  });
});

describe("createMany may to many", () => {
  it("create", async () => {
    const categories = await db.query.categories.findMany({
      limit: 3,
      orderBy: { name: "asc" },
    });

    const user = await db.query.users.findFirst();
    const result = await client.mutation(query, {
      input: [
        {
          title: "createMany",
          content: "Test",
          published: true,
          authorId: user?.id,
          categories: { set: categories.map((v) => ({ id: v.id })) },
        },
        {
          title: "createMany2",
          content: "Test2",
          published: false,
          authorId: user?.id,
          categories: { set: categories.map((v) => ({ id: v.id })) },
        },
      ],
      categoriesOrderBy: { name: "Asc" },
    });
    expect(
      filterObject(result.data, ["id", "createdAt", "updatedAt", "publishedAt"])
    ).toMatchSnapshot();
  });
});
