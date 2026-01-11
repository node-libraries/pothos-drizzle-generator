import { describe, it, expect } from "vitest";
import { replaceColumnValues } from "../../src/libs/resolver-helpers";

describe("generator utils", () => {
  describe("replaceColumnValues", () => {
    const mockTables = {
      users: {
        columns: [{ name: "id" }, { name: "name" }, { name: "email" }],
      },
      posts: {
        columns: [{ name: "id" }, { name: "title" }, { name: "authorId" }],
      },
    };

    it("should handle __typename only tree", () => {
      const tree = { __typename: true };
      const queryData = {};
      const result = replaceColumnValues(mockTables as never, "users", tree, queryData);
      expect(result.columns).toEqual({});
      expect("extras" in result && result.extras).toBeDefined();
    });

    it("should map simple columns", () => {
      const tree = { id: true, name: true, invalid: true };
      const queryData = {};
      const result = replaceColumnValues(mockTables as never, "users", tree, queryData);
      expect(result.columns).toEqual({ id: true, name: true });
      expect(result.columns).not.toHaveProperty("invalid");
    });

    it("should recurse for relations (nested queries)", () => {
      const tree = {
        id: true,
        posts: {
          title: true,
        },
      };
      const queryData = {
        with: {
          posts: {
            _name: "posts",
            columns: {},
          },
        },
      };

      const result = replaceColumnValues(mockTables as never, "users", tree, queryData);

      expect(result.columns).toEqual({ id: true });
      expect("with" in result && result.with?.posts.columns).toEqual({ title: true });
    });
  });
});
