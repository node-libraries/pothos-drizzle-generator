import { gql } from "@urql/core";
import { describe, it, expect, afterEach } from "vitest";
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

const mutationUpdatePost = gql`
  mutation UpdatePost($where: PostWhere, $input: PostUpdate!) {
    updatePost(where: $where, input: $input) {
      id
      title
    }
  }
`;

const mutationDeletePost = gql`
  mutation DeletePost($where: PostWhere) {
    deletePost(where: $where) {
      id
    }
  }
`;

const queryFindFirstPostById = gql`
  query FindFirstPost($id: String) {
    findFirstPost(where: { id: { eq: $id } }) {
      id
      published
      authorId
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

describe("Authentication and Authorization Tests", () => {
  afterEach(async () => {
    await client.mutation(mutationSignOut, {});
  });

  it("should correctly handle signIn and me mutation", async () => {
    const user = await db.query.users.findFirst({
      with: { posts: true },
      where: { posts: { published: false } },
      orderBy: { id: "asc" },
    });
    if (!user) throw "No user found";

    // me should be null when not signed in
    const meBefore = await client.mutation(mutationMe, {});
    expect(meBefore.data.me).toBe(null);

    // signIn should return the user
    const signInResult = await client.mutation(mutationSignIn, {
      email: user.email,
    });
    expect(signInResult.data.signIn.id).toBe(user.id);

    // me should return the user after signIn
    const meAfter = await client.mutation(mutationMe, {});
    expect(meAfter.data.me.id).toBe(user.id);
  });

  it("should filter findManyPost results based on authentication", async () => {
    const userWithPrivatePosts = await db.query.users.findFirst({
      where: { posts: { published: false } },
    });
    if (!userWithPrivatePosts) throw "No user with private posts found";

    // Guest user should only see published posts
    const guestResponse = await client.query(query, {
      orderBy: [{ id: "Asc" }],
    });
    const guestPosts: { published: boolean }[] =
      guestResponse.data.findManyPost;
    expect(guestPosts).not.toHaveLength(0);
    expect(guestPosts.some((post) => post.published === false)).toBe(false);

    // Signed in user should see published posts AND their own private posts
    await client.mutation(mutationSignIn, {
      email: userWithPrivatePosts.email,
    });

    const userResponse = await client.query(query, {
      orderBy: [{ id: "Asc" }],
    });
    const userPosts: { published: boolean }[] = userResponse.data.findManyPost;
    expect(userPosts).not.toHaveLength(0);
    expect(userPosts.some((post) => post.published === false)).toBe(true);
  });

  it("should restrict createOnePost based on authentication", async () => {
    const user = await db.query.users.findFirst({
      where: { posts: { published: false } },
      orderBy: { id: "asc" },
    });
    if (!user) throw "No user found";

    // Guest cannot create a post
    const guestCreate = await client.mutation(mutationCreateOnePost, {
      input: {
        title: "Guest Post",
        content: "Test Content",
        published: true,
      },
    });
    expect(guestCreate.error).toMatchObject({
      message: "[GraphQL] No permission",
    });

    // Signed in user can create a post
    await client.mutation(mutationSignIn, {
      email: user.email,
    });
    const userCreate = await client.mutation(mutationCreateOnePost, {
      input: {
        title: "User Post",
        content: "Test Content",
        published: true,
      },
    });
    expect(userCreate.data.createOnePost).toMatchObject({
      authorId: user.id,
    });
  });

  it("should only allow users to update their own posts", async () => {
    const users = await db.query.users.findMany({
      with: { posts: true },
      orderBy: { id: "asc" },
    });
    const user1 = users[0];
    const user2 = users[1];
    if (!user1 || !user2) throw "Need at least 2 users";

    const user1Post = user1.posts[0];
    const user2Post = user2.posts[0];
    if (!user1Post || !user2Post) throw "Users need posts";

    // Login as user1
    await client.mutation(mutationSignIn, { email: user1.email });

    // Update own post - should succeed
    const updateOwn = await client.mutation(mutationUpdatePost, {
      where: { id: { eq: user1Post.id } },
      input: { title: "Updated Title" },
    });
    expect(updateOwn.data.updatePost[0].id).toBe(user1Post.id);

    // Update other's post - should return empty array because of 'where' filter
    const updateOther = await client.mutation(mutationUpdatePost, {
      where: { id: { eq: user2Post.id } },
      input: { title: "Should Not Work" },
    });
    expect(updateOther.data.updatePost).toHaveLength(0);
  });

  it("should only allow users to delete their own posts", async () => {
    const users = await db.query.users.findMany({
      with: { posts: true },
      orderBy: { id: "asc" },
    });
    const user1 = users[0];
    const user2 = users[1];
    if (!user1 || !user2) throw "Need at least 2 users";

    const user1Post = user1.posts[0];
    const user2Post = user2.posts[0];
    if (!user1Post || !user2Post) throw "Users need posts";

    // Login as user1
    await client.mutation(mutationSignIn, { email: user1.email });

    // Delete other's post - should return empty array because of 'where' filter
    const deleteOther = await client.mutation(mutationDeletePost, {
      where: { id: { eq: user2Post.id } },
    });
    expect(deleteOther.data.deletePost).toHaveLength(0);

    // Delete own post - should succeed
    const deleteOwn = await client.mutation(mutationDeletePost, {
      where: { id: { eq: user1Post.id } },
    });
    expect(deleteOwn.data.deletePost[0].id).toBe(user1Post.id);
  });

  it("should filter findFirstPost results based on authentication", async () => {
    const user = await db.query.users.findFirst({
      where: { posts: { published: false } },
      with: { posts: true },
    });
    if (!user) throw "No user found";
    const privatePost = user.posts.find((p) => !p.published);
    if (!privatePost) throw "No private post found";

    // Guest should not find a private post
    const guestResponse = await client.query(queryFindFirstPostById, {
      id: privatePost.id,
    });
    expect(guestResponse.data.findFirstPost).toBe(null);

    // Signed in user should find their own private post
    await client.mutation(mutationSignIn, { email: user.email });
    const userResponse = await client.query(queryFindFirstPostById, {
      id: privatePost.id,
    });
    if (userResponse.error) throw userResponse.error;
    expect(userResponse.data.findFirstPost).not.toBe(null);
    expect(userResponse.data.findFirstPost.id).toBe(privatePost.id);
  });

  it("should enforce query depth limit", async () => {
    // depthLimit is 5
    const deepQuery = gql`
      query {
        findManyPost {
          author {
            posts {
              author {
                posts {
                  author {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;
    const result = await client.query(deepQuery, {});
    expect(result.error?.message).toContain("Depth limit exceeded");
  });
});
