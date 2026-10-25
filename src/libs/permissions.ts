import { getQueryDepth } from "./graphql.js";
import { isOperation, type OperationBasic } from "./operations.js";
import type { ModelData } from "../generator.js";
import type { GraphQLResolveInfo } from "graphql";

export type ResolvedOperationParams = {
  depthLimit?: number;
  limit?: number;
  where?: object;
  orderBy?: object;
  input?: object;
};

export async function checkPermissionsAndGetParams(
  modelName: string,
  operation: (typeof OperationBasic)[number],
  ctx: object,
  info: GraphQLResolveInfo | null,
  modelData: ModelData
): Promise<ResolvedOperationParams> {
  const { executable, depthLimit, limit, where, orderBy, inputData } = modelData;

  const isExecutable = executable
    ? await executable({ modelName, ctx, operation })
    : true;
  if (isExecutable === false) {
    throw new Error("No permission");
  }

  const [resolvedDepthLimit, resolvedLimit, resolvedWhere, resolvedOrderBy, resolvedInput] =
    await Promise.all([
      depthLimit ? depthLimit({ modelName, ctx, operation }) : undefined,
      limit ? limit({ modelName, ctx, operation }) : undefined,
      where ? where({ modelName, ctx, operation }) : undefined,
      orderBy ? orderBy({ modelName, ctx, operation }) : undefined,
      isOperation("mutation", operation) && inputData
        ? inputData({ modelName, ctx, operation })
        : undefined,
    ]);

  const params: ResolvedOperationParams = {
    depthLimit: resolvedDepthLimit,
    limit: resolvedLimit,
    where: resolvedWhere,
    orderBy: resolvedOrderBy,
    input: resolvedInput,
  };

  if (info && params.depthLimit !== undefined && getQueryDepth(info) > params.depthLimit) {
    throw new Error("Depth limit exceeded");
  }

  return params;
}
