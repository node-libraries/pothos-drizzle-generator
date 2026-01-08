import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { clearLogs, createClient, filterObject, getLogs, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

const CREATE_ONE_POST = gql`
  fragment post on Post {
    id
    title
    content
    published
    authorId
  }

  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      ...post
      author {
        id
        name
      }
    }
  }
`;

const CREATE_ONE_POST_TYPENAME = gql`
  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      __typename
    }
  }
`;
const CREATE_ONE_POST_TYPENAME2 = gql`
  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      categories {
        __typename
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
}

describe("Mutation: createOnePost (Drizzle v2 Pure Object Syntax)", () => {
  const IGNORED_KEYS = ["id", "createdAt", "updatedAt", "publishedAt"];

  beforeAll(async () => {
    await db.resetSchema();
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should create a single post with non-null fields and return the created record", async () => {
    const author = await db.query.users.findFirst({
      where: {
        id: { isNotNull: true },
      },
    });

    if (!author) throw new Error("Author not found for testing");

    clearLogs(db);

    const input = {
      title: "New Single Post",
      content: "Required Content Body",
      authorId: author.id,
      published: true,
    };

    const result = await client.mutation<{ createOnePost: PostResponse }>(CREATE_ONE_POST, {
      input,
    });
    expect(getLogs(db).length).toBe(4);
    expect(result.error).toBeUndefined();
    const createdPost = result.data?.createOnePost;

    if (!createdPost) throw new Error("Mutation result data is missing");

    expect(filterObject(createdPost, IGNORED_KEYS)).toMatchSnapshot();
    expect(createdPost.author.id).toBe(author.id);

    const savedPost = await db.query.posts.findFirst({
      where: {
        id: { eq: createdPost.id },
      },
    });

    expect(savedPost).toBeDefined();
    expect(savedPost?.title).toBe("New Single Post");
    expect(savedPost?.content).toBe("Required Content Body");
    expect(savedPost?.published).toBe(true);
  });

  it("should create a post and verify it with complex object filtering", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const uniqueTitle = `unique-${Date.now()}`;

    const result = await client.mutation<{ createOnePost: PostResponse }>(CREATE_ONE_POST, {
      input: {
        title: uniqueTitle,
        content: "Mandatory Content",
        authorId: author.id,
        published: false,
      },
    });

    const createdPost = result.data?.createOnePost;
    if (!createdPost) throw new Error("Post creation failed");

    const verified = await db.query.posts.findFirst({
      where: {
        id: { eq: createdPost.id },
        title: { eq: uniqueTitle },
        published: { eq: false },
      },
    });

    expect(verified).toBeDefined();
    expect(verified?.id).toBe(createdPost.id);
  });

  it("should return an error when required fields are missing (Schema Validation)", async () => {
    const post = await db.query.posts.findFirst();
    const result = await client.mutation(
      gql`
        mutation CreateOneCategory {
          createOneCategory(input: { posts: { set: [{ id: "${post!.id}" }] } }) {
            id
            name
          }
        }
      `,
      {
        input: {
          title: "Incomplete Post",
        },
      }
    );

    expect(result.error).toBeDefined();
  });

  it("should create a post and return only __typename", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");

    const result = await client.mutation<{ createOnePost: { __typename: string } }>(
      CREATE_ONE_POST_TYPENAME,
      {
        input: {
          title: "Only Typename",
          content: "Content",
          authorId: author.id,
          published: false,
        },
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.createOnePost.__typename).toBe("Post");
  });
  it("should create a post and return only relation __typename", async () => {
    const author = await db.query.users.findFirst();
    if (!author) throw new Error("Author required");
    const category = await db.query.categories.findFirst();
    if (!category) throw new Error("Category required");
    const result = await client.mutation<{
      createOnePost: { categories: [{ __typename: string }] };
    }>(CREATE_ONE_POST_TYPENAME2, {
      input: {
        title: "Only Typename",
        content: "Content",
        authorId: author.id,
        published: false,
        categories: {
          set: [{ id: category.id }],
        },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.createOnePost.categories[0].__typename).toBe("Category");
  });

  it("should create a single post with relations without error (Validation for dbColumnsInput fix)", async () => {
    const categories = await db.query.categories.findMany({ limit: 1 });
    if (categories.length < 1) throw new Error("Need at least 1 category");
    clearLogs(db);
    const result = await client.mutation<{
      createOnePost: { id: string; title: string; categories: { name: string }[] };
    }>(
      gql`
        mutation CreateOnePost {
          createOnePost(input: {
            title: "Post with Category",
            content: "",
            published: true,
            categories: {
              set: [{ id: "${categories[0].id}" }],
            }
          }) {
            id
            title
            categories {
              name
            }
          }
        }
      `,
      {}
    );
    expect(result.error).toBeUndefined();
    const data = result.data?.createOnePost;
    expect(data).toBeDefined();
    expect(data?.categories).toHaveLength(1);
    expect(data?.categories[0].name).toBe(categories[0].name);
  });
});
