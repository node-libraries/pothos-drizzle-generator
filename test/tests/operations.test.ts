import { describe, expect, it } from "vitest";
import {
  expandOperations,
  isOperation,
  OperationBasic,
  OperationCreate,
  OperationDelete,
  OperationFind,
  OperationMutation,
  OperationQuery,
  OperationUpdate,
} from "../../src/libs/operations";

describe("operations", () => {
  describe("expandOperations", () => {
    it('should expand "all" to all basic operations', () => {
      const result = expandOperations(["all"]);
      expect(result).toEqual(OperationBasic);
    });

    it('should expand "find" to findFirst and findMany', () => {
      const result = expandOperations(["find"]);
      expect(result).toEqual(OperationFind);
    });

    it('should expand "update" to update', () => {
      const result = expandOperations(["update"]);
      expect(result).toEqual(OperationUpdate);
    });

    it('should expand "delete" to delete', () => {
      const result = expandOperations(["delete"]);
      expect(result).toEqual(OperationDelete);
    });

    it('should expand "query" to all query operations', () => {
      const result = expandOperations(["query"]);
      expect(result).toEqual(OperationQuery);
    });

    it('should expand "mutation" to all mutation operations', () => {
      const result = expandOperations(["mutation"]);
      expect(result).toEqual(OperationMutation);
    });

    it("should keep basic operations as is", () => {
      const result = expandOperations(["findFirst", "createOne"]);
      expect(result).toEqual(["findFirst", "createOne"]);
    });

    it("should handle mixed operations", () => {
      const result = expandOperations(["find", "createOne"]);
      expect(result).toEqual([...OperationFind, "createOne"]);
    });
  });

  describe("isOperation", () => {
    it("should return true if operation is included in the list", () => {
      expect(isOperation(["findFirst", "findMany"], "findFirst")).toBe(true);
    });

    it("should return false if operation is not included in the list", () => {
      expect(isOperation(["findFirst"], "findMany")).toBe(false);
    });
  });

  describe("isOperationInclude", () => {
    it('should return true if "all" includes any basic operation', () => {
      expect(isOperation(["all"], "findFirst")).toBe(true);
      expect(isOperation(["all"], "createOne")).toBe(true);
    });

    it('should return true if "query" includes findFirst', () => {
      expect(isOperation(["query"], "findFirst")).toBe(true);
    });

    it('should return false if "query" does not include createOne', () => {
      expect(isOperation(["query"], "createOne")).toBe(false);
    });

    it("should return true if a specific list includes the operation", () => {
      expect(isOperation(["findFirst", "findMany"], "findFirst")).toBe(true);
    });

    it('should return true when checking if "all" includes "query"', () => {
      expect(isOperation(["all"], "query")).toBe(true);
    });

    it('should return false when "find" does not include "mutation"', () => {
      expect(isOperation(["find"], "mutation")).toBe(false);
    });

    it('should return true when "mutation" includes "update"', () => {
      expect(isOperation(["mutation"], "update")).toBe(true);
    });

    it('should return true when "mutation" includes OperationCreate', () => {
      expect(isOperation(["mutation"], "createOne")).toBe(true);
      expect(isOperation(["mutation"], "createMany")).toBe(true);
    });

    it("should verify that OperationCreate is correctly defined", () => {
      expect(OperationCreate).toEqual(["createOne", "createMany"]);
    });
  });
});
