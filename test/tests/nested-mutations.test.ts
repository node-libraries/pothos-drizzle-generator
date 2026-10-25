import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

const CREATE_USER_WITH_POSTS = gql`
  mutation CreateUserWithPosts($input: UserCreate!) {
    createOneUser(input: $input) {
      id
      name
      email
      posts {
        id
        title
        authorId
      }
    }
  }
`;

const CREATE_POST_WITH_AUTHOR_SET = gql`
  mutation CreatePostWithAuthor($input: PostCreate!) {
    createOnePost(input: $input) {
      id
      title
      authorId
      author {
        id
        name
      }
    }
  }
`;

const UPDATE_USER_WITH_POSTS_SET = gql`
  mutation UpdateUserWithPostsSet($input: UserUpdate!, $where: UserWhere) {
    updateUser(input: $input, where: $where) {
      id
      posts {
        id
        title
      }
    }
  }
`;

describe("Nested Mutations (1:N and 1:1)", () => {
  beforeAll(async () => {
    await db.resetSchema();
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should create user and deeply create related posts in 1:N relation", async () => {
    const result = await client.mutation<{
      createOneUser: {
        id: string;
        name: string;
        email: string;
        posts: { id: string; title: string; authorId: string }[];
      };
    }>(CREATE_USER_WITH_POSTS, {
      input: {
        name: "Nested Author",
        email: "nested-author@example.com",
        posts: {
          create: [{ title: "Deep Post 1" }, { title: "Deep Post 2" }],
        },
      },
    });

    expect(result.error).toBeUndefined();
    const user = result.data?.createOneUser;
    expect(user).toBeDefined();
    expect(user?.name).toBe("Nested Author");
    expect(user?.posts).toHaveLength(2);
    expect(user?.posts[0].authorId).toBe(user?.id);
    expect(user?.posts[1].authorId).toBe(user?.id);

    const postsInDb = await db.query.posts.findMany({
      where: { authorId: { eq: user!.id } },
    });
    expect(postsInDb).toHaveLength(2);
  });

  it("should create post and set author using 1:1 / N:1 author: { set: { id } }", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const result = await client.mutation<{
      createOnePost: {
        id: string;
        title: string;
        authorId: string;
        author: { id: string; name: string };
      };
    }>(CREATE_POST_WITH_AUTHOR_SET, {
      input: {
        title: "Post with Author Set",
        author: {
          set: { id: author.id },
        },
      },
    });

    expect(result.error).toBeUndefined();
    const post = result.data?.createOnePost;
    expect(post).toBeDefined();
    expect(post?.authorId).toBe(author.id);
    expect(post?.author.id).toBe(author.id);
  });

  it("should connect existing posts to user via 1:N posts: { set: [{ id }] }", async () => {
    const user = await db.query.users.findFirst({
      where: { email: { eq: "nested-author@example.com" } },
    });
    const otherPost = await db.query.posts.findFirst({
      where: { authorId: { ne: user!.id } },
    });
    if (!user || !otherPost) throw new Error("Seed required");

    const result = await client.mutation<{
      updateUser: {
        id: string;
        posts: { id: string; title: string }[];
      }[];
    }>(UPDATE_USER_WITH_POSTS_SET, {
      where: { id: { eq: user.id } },
      input: {
        posts: {
          set: [{ id: otherPost.id }],
        },
      },
    });

    expect(result.error).toBeUndefined();
    const updatedUser = result.data?.updateUser[0];
    expect(updatedUser?.posts.some((p) => p.id === otherPost.id)).toBe(true);

    const checkDb = await db.query.posts.findFirst({
      where: { id: { eq: otherPost.id } },
    });
    expect(checkDb?.authorId).toBe(user.id);
  });
});
