import { gql } from "@urql/core";
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { isOperation, OperationMutation, OperationQuery } from "../../src";
import { relations } from "../db/relations";
import { onCreateBuilder } from "../libs/test-operations";
import { createClient } from "../libs/test-tools";

const mutationMe = gql`
  fragment user on User {
    id
    email
    name
    roles
    createdAt
    updatedAt
  }
  mutation Me {
    me {
      ...user
    }
  }
`;
const mutationSignIn = gql`
  fragment user on User {
    id
    email
    name
    roles
    createdAt
    updatedAt
  }
  mutation SignIn($email: String) {
    signIn(email: $email) {
      ...user
    }
  }
`;
const mutationSignOut = gql`
  mutation SignOut {
    signOut
  }
`;

const mutationCreateOnePost = gql`
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

  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      ...post
    }
  }
`;

const { client, db } = createClient({
  onCreateBuilder,
  relations,
  pothosDrizzleGenerator: {
    all: {
      // Maximum query depth
      depthLimit: () => 5,
      executable: ({ operation, ctx }) => {
        // Prohibit write operations if the user is not authenticated
        if (isOperation(OperationMutation, operation) && !ctx.get("user")) {
          return false;
        }
        return true;
      },
      inputFields: () => {
        // Exclude auto-generated fields
        return { exclude: ["createdAt", "updatedAt"] };
      },
    },
    // Apply to individual models
    models: {
      posts: {
        // Set the current user's ID when writing data
        inputData: ({ ctx }) => {
          const user = ctx.get("user");
          if (!user) throw new Error("No permission");
          return { authorId: user.id };
        },
        where: ({ ctx, operation }) => {
          // When querying, only return published data or the user's own data
          if (isOperation(OperationQuery, operation)) {
            return {
              OR: [{ authorId: ctx.get("user")?.id }, { published: true }],
            };
          }
          // When writing, only allow operations on the user's own data
          if (isOperation(OperationMutation, operation)) {
            return { authorId: ctx.get("user")?.id };
          }
        },
      },
    },
  },
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
  fragment category on Category {
    id
    name
    createdAt
    updatedAt
  }
  fragment user on User {
    id
    email
    name
    roles
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
    findManyPost(
      offset: $offset
      limit: $limit
      where: $where
      orderBy: $orderBy
    ) {
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

describe("auth", () => {
  afterEach(async () => {
    await client.mutation(mutationSignOut, {});
  });
  it("signIn", async () => {
    const user = await db.query.users.findFirst({
      with: { posts: true },
      where: { posts: { published: false } },
      orderBy: { id: "asc" },
    });
    if (!user) throw "No user found";

    expect((await client.mutation(mutationMe, {})).data.me).toBe(null);
    expect(
      (
        await client.mutation(mutationSignIn, {
          email: user.email,
        })
      ).data.signIn.id
    ).toBe(user.id);
  });

  it("auth user findMany", async () => {
    const user = await db.query.users.findFirst({
      with: { posts: true },
      where: { posts: { published: false } },
      orderBy: { id: "asc" },
    });
    const noLogin = await client.query(query, {
      orderBy: [{ id: "Asc" }],
    });
    const noLoginPosts: { published: boolean }[] = noLogin.data.findManyPost;
    expect(noLoginPosts).not.toHaveLength(0);
    expect(noLoginPosts.some((v) => v.published === false)).toBe(false);

    await client.mutation(mutationSignIn, {
      email: user?.email,
    });

    const result = await client.query(query, {
      orderBy: [{ id: "Asc" }],
    });
    const posts: { published: boolean }[] = result.data.findManyPost;
    expect(posts).not.toHaveLength(0);
    expect(posts.some((v) => v.published === false)).toBe(true);
  });

  it("auth user createOne", async () => {
    const user = await db.query.users.findFirst({
      with: { posts: true },
      where: { posts: { published: false } },
      orderBy: { id: "asc" },
    });
    const noLoginCreate = await client.mutation(mutationCreateOnePost, {
      input: {
        title: "title",
        content: "Test",
        published: true,
      },
    });
    expect(noLoginCreate.error).toMatchObject({
      message: "[GraphQL] No permission",
    });
    await client.mutation(mutationSignIn, {
      email: user?.email,
    });
    const loginCreate = await client.mutation(mutationCreateOnePost, {
      input: {
        title: "title",
        content: "Test",
        published: true,
      },
    });
    expect(loginCreate.data.createOnePost).toMatchObject({
      authorId: user?.id,
    });
  });
});
