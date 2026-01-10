const ops = <T extends string>(...args: T[]) => args;

/**
 * Operations related to finding records.
 */
export const OperationFind = ops("findFirst", "findMany");

/**
 * Operations related to querying records (find and count).
 */
export const OperationQuery = ops(...OperationFind, "count");

/**
 * Operations related to creating records.
 */
export const OperationCreate = ops("createOne", "createMany");

/**
 * Operations related to updating records.
 */
export const OperationUpdate = ops("update");

/**
 * Operations related to deleting records.
 */
export const OperationDelete = ops("delete");

/**
 * All mutation operations (create, update, delete).
 */
export const OperationMutation = ops(...OperationCreate, ...OperationUpdate, ...OperationDelete);

/**
 * Basic operations supported by the generator (query and mutation).
 */
export const OperationBasic = ops(...OperationQuery, ...OperationMutation);

/**
 * All available operations, including categories and basic operations.
 */
export const OperationAll = ops("find", "update", "delete", "query", "mutation", ...OperationBasic);

/**
 * Type representing a single operation or an operation category like "all".
 */
export type Operation = (typeof OperationAll)[number] | "all";

/**
 * Expands a list of operations (which may include categories like "all", "find")
 * into a flat array of basic operations (e.g., "findFirst", "createOne").
 * @param operations An array of operations or operation categories.
 * @returns A flat array of basic operations.
 */
export const expandOperations = (operations: Operation[]) => {
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

/**
 * Checks if a given operation (or operation category) is included in a list of operations.
 * This function expands categories like "all" or "find" before checking.
 * @param operations The list of operations or operation categories to check against.
 * @param operation The operation or operation category to check for.
 * @returns True if `op` is fully included in `operations`, false otherwise.
 */
export const isOperation = (operations: Operation[] | Operation, operation: Operation) => {
  const aOperations = new Set(
    expandOperations(Array.isArray(operations) ? operations : [operations])
  );
  const bOperations = expandOperations([operation]);
  return bOperations.every((v) => aOperations.has(v));
};
