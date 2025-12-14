export const OperationFind = ["findFirst", "findMany"] as const;
export const OperationQuery = [...OperationFind, "count"] as const;
export const OperationCreate = ["createOne", "createMany"] as const;
export const OperationUpdate = ["update"] as const;
export const OperationDelete = ["delete"] as const;
export const OperationMutation = [
  ...OperationCreate,
  ...OperationUpdate,
  ...OperationDelete,
] as const;
export const OperationBasic = [
  ...OperationQuery,
  ...OperationMutation,
] as const;
export const OperationAll = [
  "find",
  "update",
  "delete",
  "query",
  "mutation",
  ...OperationBasic,
] as const;

export type Operation = (typeof OperationAll)[number] | "all";

export const expandOperations = (operations: readonly Operation[]) => {
  return operations.flatMap<(typeof OperationBasic)[number]>((v) =>
    v === "all"
      ? OperationBasic
      : v === "find"
      ? OperationFind
      : v === "update"
      ? OperationUpdate
      : v === "delete"
      ? OperationDelete
      : v === "query"
      ? OperationQuery
      : v === "mutation"
      ? OperationMutation
      : [v]
  );
};

export const isOperation = (
  operations: readonly string[],
  operation: (typeof OperationBasic)[number]
) => {
  return operations.includes(operation);
};
