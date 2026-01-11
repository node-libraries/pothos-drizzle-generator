import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import { createClient, getSearchPath } from "../libs/test-tools";

export const { app, client, db } = createClient({
  searchPath: getSearchPath(import.meta.url),
  relations,
  pothosDrizzleGenerator: {},
});

const CREATE_ONE_USER = gql`
  mutation CreateOneUser($input: UserCreate!) {
    createOneUser(input: $input) {
      id
      email
    }
  }
`;

const CREATE_ONE_POST = gql`
  mutation CreateOnePost($input: PostCreate!) {
    createOnePost(input: $input) {
      id
      title
    }
  }
`;

describe("Error Handling", () => {
  beforeAll(async () => {
    await db.resetSchema();
  });

  afterAll(async () => {
    await db.dropSchema();
  });

  it("should return a GraphQL error on unique constraint violation", async () => {
    const existingUser = await db.query.users.findFirst({
      where: { email: { isNotNull: true } },
    });
    if (!existingUser)
      throw new Error("Test requires at least one user with an email in the database.");

    const result = await client.mutation(CREATE_ONE_USER, {
      input: {
        email: existingUser.email,
      },
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch(/\[GraphQL\] Failed query*./);
  });

  it("should return a GraphQL error on foreign key constraint violation", async () => {
    const nonExistentAuthorId = "00000000-0000-0000-0000-000000000000";

    const result = await client.mutation(CREATE_ONE_POST, {
      input: {
        title: "Post with invalid author",
        content: "This should fail.",
        published: false,
        authorId: nonExistentAuthorId,
      },
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch(/\[GraphQL\] Failed query*./);
  });
});
