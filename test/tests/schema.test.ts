import { describe, it, expect } from "vitest";
import { OperationQuery } from "../../src";
import { relations } from "../db/relations";
import {
  createApp,
  getGraphqlModels,
  getGraphqlOperations,
} from "../libs/test-tools";

describe("GraphQL Schema operations", () => {
  it("operations include createMany", () => {
    const { schema } = createApp({
      relations,
      pothosDrizzleGenerator: {
        all: {
          operations() {
            return { include: ["createMany"] };
          },
        },
      },
    });
    const fields = getGraphqlOperations(schema);
    expect(fields.every((v) => v.startsWith("createMany"))).toBe(true);
  });
  it("operations include query", () => {
    const { schema } = createApp({
      relations,
      pothosDrizzleGenerator: {
        all: {
          operations() {
            return { include: ["query"] };
          },
        },
      },
    });
    const fields = getGraphqlOperations(schema);
    expect(
      fields.every((v) => OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(true);
  });
  it("operations exclude query", () => {
    const { schema } = createApp({
      relations,
      pothosDrizzleGenerator: {
        all: {
          operations() {
            return { exclude: ["query"] };
          },
        },
      },
    });
    const fields = getGraphqlOperations(schema);
    expect(fields).not.toHaveLength(0);
    expect(
      fields.every((v) => !OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(true);
  });
  it("operations exclude query", () => {
    const { schema } = createApp({
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
    const fields = getGraphqlOperations(schema);
    const postFields = fields.filter((v) => v.endsWith("Post"));
    expect(fields).not.toHaveLength(postFields.length);
    expect(postFields).not.toHaveLength(0);
    expect(
      fields.every((v) => !OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(false);
    expect(
      postFields.every((v) => !OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(true);
  });

  it("operations exclude query 2", () => {
    const { schema } = createApp({
      relations,
      pothosDrizzleGenerator: {
        all: {
          operations({ modelName }) {
            if (modelName === "posts") return { exclude: ["query"] };
          },
        },
      },
    });
    const fields = getGraphqlOperations(schema);
    const postFields = fields.filter((v) => v.endsWith("Post"));
    expect(fields).not.toHaveLength(postFields.length);
    expect(postFields).not.toHaveLength(0);
    expect(
      fields.every((v) => !OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(false);
    expect(
      postFields.every((v) => !OperationQuery.some((o) => v.startsWith(o)))
    ).toBe(true);
  });

  describe("GraphQL Schema model filter", () => {
    it("use include", () => {
      const { schema } = createApp({
        relations,
        pothosDrizzleGenerator: {
          use: { include: ["users", "posts"] },
        },
      });
      const modelNames = getGraphqlModels(schema).map((v) => v.name);
      expect(modelNames).toHaveLength(2);
      expect(modelNames).toContain("User");
      expect(modelNames).toContain("Post");
    });

    it("use exclude", () => {
      const { schema } = createApp({
        relations,
        pothosDrizzleGenerator: {
          use: { exclude: ["users", "posts"] },
        },
      });
      const modelNames = getGraphqlModels(schema).map((v) => v.name);
      expect(modelNames).not.toHaveLength(0);
      expect(modelNames).not.toContain("User");
      expect(modelNames).not.toContain("Post");
    });
  });

  describe("GraphQL Schema model fields", () => {
    it("include", () => {
      const { schema } = createApp({
        relations,
        pothosDrizzleGenerator: {
          all: {
            fields: () => ({
              include: ["authorId", "categories", "categoriesCount"],
            }),
          },
        },
      });
      const model = getGraphqlModels(schema).find((v) => v.name === "Post");
      const fields = Object.keys(model!.getFields());
      expect(fields).toHaveLength(3);
      expect(fields).toContain("authorId");
      expect(fields).toContain("categories");
      expect(fields).toContain("categoriesCount");
    });
    it("include", () => {
      const { schema } = createApp({
        relations,
        pothosDrizzleGenerator: {
          models: {
            posts: {
              fields: () => ({
                include: ["authorId", "categories", "categoriesCount"],
              }),
            },
          },
        },
      });
      const model = getGraphqlModels(schema).find((v) => v.name === "Post");
      const fields = Object.keys(model!.getFields());
      expect(fields).toHaveLength(3);
      expect(fields).toContain("authorId");
      expect(fields).toContain("categories");
      expect(fields).toContain("categoriesCount");
    });
    it("exclude", () => {
      const { schema } = createApp({
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
      const model = getGraphqlModels(schema).find((v) => v.name === "Post");
      const fields = Object.keys(model!.getFields());
      expect(fields).not.toHaveLength(0);
      expect(fields).not.toContain("authorId");
      expect(fields).not.toContain("categories");
      expect(fields).not.toContain("categoriesCount");
    });
  });
});
