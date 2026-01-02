import { gql } from "@urql/core";
import { describe, it, expect, afterEach } from "vitest";
import { isOperation, OperationMutation, OperationQuery } from "../../src";
import { relations } from "../db/relations";
import { onCreateBuilder } from "../libs/test-operations";
import { createClient } from "../libs/test-tools";

// GraphQL Fragments & Mutations
const USER_FRAGMENT = gql`
  fragment user on User {
    id
    email
    name
    roles
  }
`;

const POST_FRAGMENT = gql`
  fragment post on Post {
    id
    published
    title
    content
    authorId
  }
`;

const MUTATION_ME = gql`
  ${USER_FRAGMENT}
  mutation Me {
    me {
      ...user
    }
  }
`;

const MUTATION_SIGN_IN = gql`
  ${USER_FRAGMENT}
  mutation SignIn($email: String) {
    signIn(email: $email) {
      ...user
    }
  }
`;

const MUTATION_SIGN_OUT = gql`
  mutation SignOut {
    signOut
  }
`;

const MUTATION_CREATE_ONE_POST = gql`
  ${POST_FRAGMENT}
  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      ...post
    }
  }
`;

const MUTATION_UPDATE_POST = gql`
  ${POST_FRAGMENT}
  mutation UpdatePost($where: PostWhere, $input: PostUpdate!) {
    updatePost(where: $where, input: $input) {
      ...post
    }
  }
`;

const QUERY_FIND_FIRST_POST_BY_ID = gql`
  query FindFirstPost($id: String) {
    findFirstPost(where: { id: { eq: $id } }) {
      id
      published
      authorId
    }
  }
`;

const QUERY_FIND_MANY_POST = gql`
  ${POST_FRAGMENT}
  ${USER_FRAGMENT}
  query FindManyPost($where: PostWhere, $orderBy: [PostOrderBy!]) {
    findManyPost(where: $where, orderBy: $orderBy) {
      ...post
      author {
        ...user
      }
    }
  }
`;

interface UserResponse {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface PostResponse {
  id: string;
  published: boolean;
  title: string;
  content: string;
  authorId: string;
}

const { client, db } = createClient({
  onCreateBuilder,
  relations,
  pothosDrizzleGenerator: {
    all: {
      depthLimit: () => 5,
      executable: ({ operation, ctx }) => {
        // isOperation を使用した判定に修正
        if (isOperation(OperationMutation, operation) && !ctx.get("user")) {
          return false;
        }
        return true;
      },
    },
    models: {
      posts: {
        inputData: ({ ctx }) => {
          const user = ctx.get("user");
          if (!user) throw new Error("No permission");
          return { authorId: user.id };
        },
        where: ({ ctx, operation }) => {
          // isOperation(OperationQuery, ...) を使用
          if (isOperation(OperationQuery, operation)) {
            return {
              OR: [
                { authorId: { eq: ctx.get("user")?.id } },
                { published: { eq: true } },
              ],
            };
          }
          // isOperation(OperationMutation, ...) を使用
          if (isOperation(OperationMutation, operation)) {
            return { authorId: { eq: ctx.get("user")?.id } };
          }
        },
      },
    },
  },
});

describe("Authentication and Authorization Tests", () => {
  afterEach(async () => {
    await client.mutation(MUTATION_SIGN_OUT, {});
  });

  it("should correctly handle signIn and me mutation", async () => {
    const user = await db.query.users.findFirst({
      where: { email: { isNotNull: true } },
    });
    if (!user) throw new Error("No user found");

    const meBefore = await client.mutation<{ me: UserResponse | null }>(
      MUTATION_ME,
      {}
    );
    expect(meBefore.data?.me).toBe(null);

    await client.mutation(MUTATION_SIGN_IN, { email: user.email });

    const meAfter = await client.mutation<{ me: UserResponse }>(
      MUTATION_ME,
      {}
    );
    expect(meAfter.data?.me.id).toBe(user.id);
  });

  it("should filter findManyPost results based on authentication", async () => {
    // ゲスト状態: 公開済みのみ
    const guestResponse = await client.query<{ findManyPost: PostResponse[] }>(
      QUERY_FIND_MANY_POST,
      {
        orderBy: [{ id: "Asc" }],
      }
    );
    const guestPosts = guestResponse.data?.findManyPost ?? [];
    expect(guestPosts.length).toBeGreaterThan(0);
    expect(guestPosts.every((p) => p.published)).toBe(true);

    // ログイン状態: 公開済み + 自分の非公開
    const userWithPrivate = await db.query.users.findFirst({
      where: { posts: { published: false } },
    });
    await client.mutation(MUTATION_SIGN_IN, { email: userWithPrivate?.email });

    const userResponse = await client.query<{ findManyPost: PostResponse[] }>(
      QUERY_FIND_MANY_POST,
      {}
    );
    expect(userResponse.data?.findManyPost.some((p) => !p.published)).toBe(
      true
    );
  });

  it("should restrict createOnePost based on authentication", async () => {
    const guestCreate = await client.mutation(MUTATION_CREATE_ONE_POST, {
      input: { title: "Guest", content: "Guest", published: true },
    });
    expect(guestCreate.error?.message).toContain("No permission");

    const user = await db.query.users.findFirst();
    await client.mutation(MUTATION_SIGN_IN, { email: user?.email });

    const userCreate = await client.mutation<{ createOnePost: PostResponse }>(
      MUTATION_CREATE_ONE_POST,
      {
        input: { title: "User Post", content: "Content", published: true },
      }
    );
    expect(userCreate.data?.createOnePost.authorId).toBe(user?.id);
  });

  it("should only allow users to update their own posts", async () => {
    const users = await db.query.users.findMany({ with: { posts: true } });
    const user1 = users[0];
    const user2 = users[1];
    const user2Post = user2.posts[0];

    await client.mutation(MUTATION_SIGN_IN, { email: user1.email });

    // 他人の投稿更新を試みる (whereフィルタにより対象0となり空配列が返る)
    const result = await client.mutation<{ updatePost: PostResponse[] }>(
      MUTATION_UPDATE_POST,
      {
        where: { id: { eq: user2Post.id } },
        input: { title: "Unauthorized" },
      }
    );
    expect(result.data?.updatePost).toHaveLength(0);
  });

  it("should return null for findFirstPost if target is private and user is not author", async () => {
    const user = await db.query.users.findFirst();
    const privatePost = await db.query.posts.findFirst({
      where: {
        authorId: { eq: user?.id },
        published: { eq: false },
      },
    });

    if (!privatePost) return;

    // ゲストは非公開記事を取得できない (null)
    const response = await client.query<{ findFirstPost: PostResponse | null }>(
      QUERY_FIND_FIRST_POST_BY_ID,
      {
        id: privatePost.id,
      }
    );
    expect(response.data?.findFirstPost).toBe(null);
  });

  it("should enforce query depth limit", async () => {
    const deepQuery = gql`
      query {
        findManyPost {
          author {
            posts {
              author {
                posts {
                  id
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
