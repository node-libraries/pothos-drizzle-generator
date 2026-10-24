import { describe, it, expect } from "vitest";
import { OperationQuery } from "../../src";
import { relations } from "../db/relations";
import {
  createApp,
  getGraphqlModels,
  getGraphqlOperations,
  getSearchPath,
} from "../libs/test-tools";

describe("GraphQL Schema Generation", () => {
  describe("Operation Filtering (Include/Exclude)", () => {
    it("should generate only createMany operations when explicitly included", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            operations() {
              return { include: ["createMany"] };
            },
          },
        },
      });
      const generatedOperations = getGraphqlOperations(schema);
      expect(generatedOperations.every((op) => op.startsWith("createMany"))).toBe(true);
    });

    it("should generate only query operations when 'query' is included", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            operations() {
              return { include: ["query"] };
            },
          },
        },
      });
      const generatedOperations = getGraphqlOperations(schema);
      expect(generatedOperations.every((op) => OperationQuery.some((q) => op.startsWith(q)))).toBe(
        true
      );
    });

    it("should exclude all query operations globally when 'query' is excluded in 'all'", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            operations() {
              return { exclude: ["query"] };
            },
          },
        },
      });
      const generatedOperations = getGraphqlOperations(schema);
      expect(generatedOperations).not.toHaveLength(0);
      expect(generatedOperations.every((op) => !OperationQuery.some((q) => op.startsWith(q)))).toBe(
        true
      );
    });

    it("should exclude query operations only for a specific model (posts)", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              operations() {
                return { exclude: ["query"] };
              },
            },
          },
        },
      });
      const allOperations = getGraphqlOperations(schema);
      const postOperations = allOperations.filter((op) => op.endsWith("Post"));

      expect(allOperations).not.toHaveLength(postOperations.length);
      expect(postOperations).not.toHaveLength(0);
      expect(allOperations.some((op) => OperationQuery.some((q) => op.startsWith(q)))).toBe(true);
      expect(postOperations.every((op) => !OperationQuery.some((q) => op.startsWith(q)))).toBe(
        true
      );
    });

    it("should apply dynamic operation filtering using modelName in the 'all' callback", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            operations({ modelName }) {
              if (modelName === "posts") return { exclude: ["query"] };
            },
          },
        },
      });
      const allOperations = getGraphqlOperations(schema);
      const postOperations = allOperations.filter((op) => op.endsWith("Post"));

      expect(postOperations).not.toHaveLength(0);
      expect(postOperations.every((op) => !OperationQuery.some((q) => op.startsWith(q)))).toBe(
        true
      );
    });

    it("should support a read-only configuration by excluding all mutations", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            operations() {
              return {
                exclude: ["createOne", "createMany", "update", "delete"],
              };
            },
          },
        },
      });
      const generatedOperations = getGraphqlOperations(schema);
      const hasMutation = generatedOperations.some(
        (op) => op.startsWith("create") || op.startsWith("update") || op.startsWith("delete")
      );
      expect(hasMutation).toBe(false);
      expect(generatedOperations.some((op) => op.startsWith("find"))).toBe(true);
    });

    it("should generate no operations for a model if include is an empty array", () => {
      try {
        const { schema } = createApp({
          searchPath: getSearchPath(import.meta.url),
          relations,
          pothosDrizzleGenerator: {
            models: {
              posts: {
                operations: () => ({ include: [] }),
              },
            },
          },
        });
        const postOperations = getGraphqlOperations(schema).filter((op) => op.endsWith("Post"));
        expect(postOperations).toHaveLength(0);
      } catch (e) {
        expect(e).toMatchObject({
          message: "PostWhere has not been implemented",
        });
      }
    });
  });

  describe("Model Visibility (Use Filter)", () => {
    it("should only expose specific models when using 'include'", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          use: { include: ["users", "posts"] },
        },
      });
      const modelNames = getGraphqlModels(schema).map((m) => m.name);
      expect(modelNames).toHaveLength(2);
      expect(modelNames).toContain("User");
      expect(modelNames).toContain("Post");
    });

    it("should hide specific models when using 'exclude'", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          use: { exclude: ["users", "posts"] },
        },
      });
      const modelNames = getGraphqlModels(schema).map((m) => m.name);
      expect(modelNames).not.toHaveLength(0);
      expect(modelNames).not.toContain("User");
      expect(modelNames).not.toContain("Post");
    });
  });

  describe("Field Filtering (Include/Exclude)", () => {
    it("should only include specified fields globally via 'all'", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            fields: () => ({
              include: ["authorId", "categories", "categoriesCount"],
            }),
          },
        },
      });
      const postModel = getGraphqlModels(schema).find((m) => m.name === "Post");
      const fieldNames = Object.keys(postModel!.getFields());
      expect(fieldNames).toHaveLength(3);
      expect(fieldNames).toContain("authorId");
      expect(fieldNames).toContain("categories");
      expect(fieldNames).toContain("categoriesCount");
    });

    it("should exclude specific fields from a particular model", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              fields: () => ({
                exclude: ["authorId", "categories", "categoriesCount"],
              }),
            },
          },
        },
      });
      const postModel = getGraphqlModels(schema).find((m) => m.name === "Post");
      const fieldNames = Object.keys(postModel!.getFields());
      expect(fieldNames).not.toHaveLength(0);
      expect(fieldNames).not.toContain("authorId");
      expect(fieldNames).not.toContain("categories");
      expect(fieldNames).toContain("id"); 
    });

    it("should prioritize model-specific field settings over global 'all' settings", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          all: {
            fields: () => ({ include: ["id"] }),
          },
          models: {
            posts: {
              fields: () => ({ include: ["id", "title"] }),
            },
          },
        },
      });
      const postModel = getGraphqlModels(schema).find((m) => m.name === "Post");
      const userModel = getGraphqlModels(schema).find((m) => m.name === "User");

      expect(Object.keys(postModel!.getFields())).toContain("title");
      expect(Object.keys(userModel!.getFields())).not.toContain("name");
    });

    it("should exclude excluded fields from Where and OrderBy input types", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              fields: () => ({
                exclude: ["content", "author"],
              }),
            },
          },
        },
      });
      const whereType = schema.getType("PostWhere") as { getFields: () => Record<string, unknown> };
      const orderByType = schema.getType("PostOrderBy") as { getFields: () => Record<string, unknown> };

      const whereFields = Object.keys(whereType.getFields());
      const orderByFields = Object.keys(orderByType.getFields());

      expect(whereFields).not.toContain("content");
      expect(whereFields).not.toContain("author");
      expect(whereFields).toContain("title");

      expect(orderByFields).not.toContain("content");
      expect(orderByFields).toContain("title");
    });

    it("should exclude relations from input types when excluded in inputFields", () => {
      const { schema } = createApp({
        searchPath: getSearchPath(import.meta.url),
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              inputFields: () => ({
                exclude: ["categories"],
              }),
            },
          },
        },
      });
      const createType = schema.getType("PostCreate") as { getFields: () => Record<string, unknown> };
      const updateType = schema.getType("PostUpdate") as { getFields: () => Record<string, unknown> };

      expect(Object.keys(createType.getFields())).not.toContain("categories");
      expect(Object.keys(updateType.getFields())).not.toContain("categories");
      expect(Object.keys(createType.getFields())).toContain("title");
    });
  });
});
