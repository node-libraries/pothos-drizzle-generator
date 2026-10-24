import { describe, it, expect } from "vitest";
import { createWhereQuery } from "../../src/libs/drizzle";
import { posts } from "../db/schema";

describe("libs/drizzle", () => {
  describe("createWhereQuery", () => {
    it("should return undefined for undefined tree", () => {
      const result = createWhereQuery(posts, undefined);
      expect(result).toBeUndefined();
    });

    it("should handle simple equality check", () => {
      const result = createWhereQuery(posts, { id: { eq: "123" } });
      // We can't easily assert the SQL string output without a driver/compiler,
      // but we can check if it returns a SQL object (not undefined).
      expect(result).toBeDefined();
    });

    it("should handle AND conditions", () => {
      const result = createWhereQuery(posts, {
        AND: [{ title: { eq: "test" } }, { published: { eq: true } }],
      });
      expect(result).toBeDefined();
    });

    it("should handle OR conditions", () => {
      const result = createWhereQuery(posts, {
        OR: [{ title: { eq: "test" } }, { published: { eq: true } }],
      });
      expect(result).toBeDefined();
    });

    it("should handle NOT conditions", () => {
      const result = createWhereQuery(posts, {
        NOT: { title: { eq: "test" } },
      });
      expect(result).toBeDefined();
    });

    it("should handle nested logical operators", () => {
      const result = createWhereQuery(posts, {
        OR: [
          { AND: [{ title: { eq: "A" } }, { published: { eq: true } }] },
          { title: { eq: "B" } },
        ],
      });
      expect(result).toBeDefined();
    });

    it("should handle empty AND array as undefined (or valid SQL depending on impl)", () => {
      // Based on implementation: return value.length ? ... : undefined
      const result = createWhereQuery(posts, { AND: [] });
      expect(result).toBeUndefined();
    });

    it("should handle mixed operators", () => {
      const result = createWhereQuery(posts, {
        title: { eq: "test", ne: "test2" },
      });
      expect(result).toBeDefined();
    });

    it("should handle isNull and isNotNull boolean values correctly", () => {
      expect(createWhereQuery(posts, { title: { isNull: true } })).toBeDefined();
      expect(createWhereQuery(posts, { title: { isNull: false } })).toBeDefined();
      expect(createWhereQuery(posts, { title: { isNotNull: true } })).toBeDefined();
      expect(createWhereQuery(posts, { title: { isNotNull: false } })).toBeDefined();
    });

    it("should safely ignore nonexistent columns or relation names", () => {
      const result = createWhereQuery(posts, {
        nonExistentColumn: { eq: "value" },
        author: { name: { eq: "John" } },
      } as never);
      expect(result).toBeUndefined();
    });
  });
});
