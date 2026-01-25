import { gql } from "@urql/core";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { relations } from "../db/relations";
import {
  createApp,
  createClient,
  getGraphqlOperations,
  getSearchPath,
} from "../libs/test-tools";

describe("Operation Aliases", () => {
  describe("Schema Generation with Aliases", () => {
    it("should generate operations with custom aliases for all operations", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              aliases: () => ({
                operations: {
                  findMany: "listPosts",
                  findFirst: "getPost",
                  count: "countPosts",
                  createOne: "addPost",
                  createMany: "addManyPosts",
                  update: "modifyPost",
                  delete: "removePost",
                },
              }),
            },
          },
        },
      });

      const operations = getGraphqlOperations(schema);

      // Verify aliased operations exist
      expect(operations).toContain("listPosts");
      expect(operations).toContain("getPost");
      expect(operations).toContain("countPosts");
      expect(operations).toContain("addPost");
      expect(operations).toContain("addManyPosts");
      expect(operations).toContain("modifyPost");
      expect(operations).toContain("removePost");

      // Verify default operations do not exist for posts
      expect(operations).not.toContain("findManyPost");
      expect(operations).not.toContain("findFirstPost");
      expect(operations).not.toContain("countPost");
      expect(operations).not.toContain("createOnePost");
      expect(operations).not.toContain("createManyPost");
      expect(operations).not.toContain("updatePost");
      expect(operations).not.toContain("deletePost");
    });

    it("should support partial aliasing (some operations aliased, others use defaults)", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            users: {
              aliases: () => ({
                operations: {
                  findMany: "listUsers",
                  createOne: "registerUser",
                },
              }),
            },
          },
        },
      });

      const operations = getGraphqlOperations(schema);

      // Verify aliased operations exist
      expect(operations).toContain("listUsers");
      expect(operations).toContain("registerUser");

      // Verify default operations exist for non-aliased operations
      expect(operations).toContain("findFirstUser");
      expect(operations).toContain("countUser");
      expect(operations).toContain("createManyUser");
      expect(operations).toContain("updateUser");
      expect(operations).toContain("deleteUser");

      // Verify aliased operations replaced defaults
      expect(operations).not.toContain("findManyUser");
      expect(operations).not.toContain("createOneUser");
    });

    it("should apply aliases per model independently", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              aliases: () => ({
                operations: {
                  findMany: "listPosts",
                },
              }),
            },
            users: {
              aliases: () => ({
                operations: {
                  findMany: "listUsers",
                },
              }),
            },
          },
        },
      });

      const operations = getGraphqlOperations(schema);

      // Verify each model has its own alias
      expect(operations).toContain("listPosts");
      expect(operations).toContain("listUsers");

      // Verify defaults don't exist for aliased operations
      expect(operations).not.toContain("findManyPost");
      expect(operations).not.toContain("findManyUser");

      // Verify other models still use defaults
      expect(operations).toContain("findManyCategory");
    });

    it("should work with operation filtering (include/exclude) and aliases", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              operations: () => ({
                include: ["findMany", "createOne"],
              }),
              aliases: () => ({
                operations: {
                  findMany: "searchPosts",
                  createOne: "newPost",
                },
              }),
            },
          },
        },
      });

      const operations = getGraphqlOperations(schema);

      // Only included operations should exist with aliases
      expect(operations).toContain("searchPosts");
      expect(operations).toContain("newPost");

      // Verify default post operations do not exist
      expect(operations).not.toContain("findManyPost");
      expect(operations).not.toContain("findFirstPost");
      expect(operations).not.toContain("countPost");
      expect(operations).not.toContain("createOnePost");
      expect(operations).not.toContain("createManyPost");
      expect(operations).not.toContain("updatePost");
      expect(operations).not.toContain("deletePost");
    });
  });

  describe("Query Execution with Aliases", () => {
    const { app, client, db } = createClient({
      searchPath: getSearchPath(import.meta.url),
      relations,
      pothosDrizzleGenerator: {
        models: {
          posts: {
            aliases: () => ({
              operations: {
                findMany: "listPosts",
                findFirst: "getPost",
                count: "countPosts",
                createOne: "addPost",
                update: "modifyPost",
                delete: "removePost",
              },
            }),
          },
        },
      },
    });

    beforeAll(async () => {
      await db.resetSchema();
    });

    afterAll(async () => {
      await db.dropSchema();
    });

    it("should execute findMany query using alias", async () => {
      const QUERY = gql`
        query ListPosts {
          listPosts(limit: 5) {
            id
            title
            published
          }
        }
      `;

      const result = await client.query(QUERY, {});

      expect(result.error).toBeUndefined();
      expect(result.data?.listPosts).toBeDefined();
      expect(Array.isArray(result.data?.listPosts)).toBe(true);
    });

    it("should execute findFirst query using alias", async () => {
      const QUERY = gql`
        query GetPost($where: PostWhere) {
          getPost(where: $where) {
            id
            title
            published
          }
        }
      `;

      const result = await client.query(QUERY, {
        where: { published: { eq: true } },
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.getPost).toBeDefined();
    });

    it("should execute count query using alias", async () => {
      const QUERY = gql`
        query CountPosts($where: PostWhere) {
          countPosts(where: $where)
        }
      `;

      const result = await client.query(QUERY, {
        where: { published: { eq: true } },
      });

      expect(result.error).toBeUndefined();
      expect(typeof result.data?.countPosts).toBe("number");
      expect(result.data?.countPosts).toBeGreaterThanOrEqual(0);
    });

    it("should execute createOne mutation using alias", async () => {
      const author = await db.query.users.findFirst();
      if (!author) throw new Error("No users found");

      const MUTATION = gql`
        mutation AddPost($input: PostCreate!) {
          addPost(input: $input) {
            id
            title
            content
            published
          }
        }
      `;

      const result = await client.mutation(MUTATION, {
        input: {
          title: "Aliased Post",
          content: "Created with alias",
          published: false,
          authorId: author.id,
        },
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.addPost).toBeDefined();
      expect(result.data?.addPost.title).toBe("Aliased Post");
    });

    it("should execute update mutation using alias", async () => {
      const post = await db.query.posts.findFirst();
      if (!post) throw new Error("No posts found");

      const MUTATION = gql`
        mutation ModifyPost($input: PostUpdate!, $where: PostWhere) {
          modifyPost(input: $input, where: $where) {
            id
            title
            published
          }
        }
      `;

      const result = await client.mutation(MUTATION, {
        where: { id: { eq: post.id } },
        input: { published: true },
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.modifyPost).toBeDefined();
      expect(Array.isArray(result.data?.modifyPost)).toBe(true);
    });

    it("should execute delete mutation using alias", async () => {
      const post = await db.query.posts.findFirst({
        where: (posts, { eq }) => eq(posts.title, "Aliased Post"),
      });
      if (!post) throw new Error("Post to delete not found");

      const MUTATION = gql`
        mutation RemovePost($where: PostWhere) {
          removePost(where: $where) {
            id
            title
          }
        }
      `;

      const result = await client.mutation(MUTATION, {
        where: { id: { eq: post.id } },
      });

      expect(result.error).toBeUndefined();
      expect(result.data?.removePost).toBeDefined();
      expect(Array.isArray(result.data?.removePost)).toBe(true);
      expect(result.data?.removePost.length).toBeGreaterThan(0);
    });
  });

  describe("Aliases with Global Configuration", () => {
    it("should support aliases in 'all' configuration using modelName", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            aliases({ modelName }) {
              if (modelName === "posts") {
                return {
                  operations: {
                    findMany: "getAllPosts",
                  },
                };
              }
              return {};
            },
          },
        },
      });

      const operations = getGraphqlOperations(schema);

      // Verify alias applied via 'all' callback
      expect(operations).toContain("getAllPosts");
      expect(operations).not.toContain("findManyPost");

      // Other models should use defaults
      expect(operations).toContain("findManyUser");
      expect(operations).toContain("findManyCategory");
    });
  });
});