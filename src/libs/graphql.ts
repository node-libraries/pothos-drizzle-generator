import type { GraphQLResolveInfo, FieldNode, SelectionNode, FragmentDefinitionNode } from "graphql";

function getDepthFromSelection(
  selection: SelectionNode | FieldNode,
  currentDepth: number,
  fragments: Record<string, FragmentDefinitionNode>,
  visitedFragments = new Set<string>()
): number {
  if (selection.kind === "Field") {
    if (selection.name.value === "__typename") return currentDepth;
    if (selection.selectionSet) {
      const childDepths = selection.selectionSet.selections.map((sel) =>
        getDepthFromSelection(sel, currentDepth + 1, fragments, visitedFragments)
      );
      return Math.max(currentDepth, ...childDepths);
    }
    return currentDepth;
  }
  if (selection.kind === "InlineFragment") {
    const childDepths = selection.selectionSet.selections.map((sel) =>
      getDepthFromSelection(sel, currentDepth, fragments, visitedFragments)
    );
    return childDepths.length ? Math.max(currentDepth, ...childDepths) : currentDepth;
  }
  if (selection.kind === "FragmentSpread") {
    const fragName = selection.name.value;
    if (visitedFragments.has(fragName)) return currentDepth;
    const fragment = fragments[fragName];
    if (!fragment) return currentDepth;
    visitedFragments.add(fragName);
    const childDepths = fragment.selectionSet.selections.map((sel) =>
      getDepthFromSelection(sel, currentDepth, fragments, visitedFragments)
    );
    visitedFragments.delete(fragName);
    return childDepths.length ? Math.max(currentDepth, ...childDepths) : currentDepth;
  }
  return currentDepth;
}

export function getQueryDepth(info: GraphQLResolveInfo): number {
  const depths = info.fieldNodes.map((node) =>
    getDepthFromSelection(node, 1, info.fragments)
  );
  return Math.max(1, ...depths);
}

export interface FieldTree {
  [key: string]: boolean | FieldTree;
}

export const getQueryFragment = (
  info: GraphQLResolveInfo,
  selectFields: FieldTree,
  field: SelectionNode
) => {
  if (field.kind === "FragmentSpread") {
    const fragment = info.fragments[field.name.value];
    fragment?.selectionSet.selections.forEach((selection) => {
      getQueryFragment(info, selectFields, selection);
    });
  } else if (field.kind === "InlineFragment") {
    field.selectionSet.selections.forEach((selection) => {
      getQueryFragment(info, selectFields, selection);
    });
  } else if (field.kind === "Field" && field.name.value !== "__typename") {
    if (field.selectionSet?.selections.length) {
      selectFields[field.name.value] = getQueryFields(info, [field]);
    } else {
      selectFields[field.name.value] = true;
    }
  }
};

export const getQueryFields = (info: GraphQLResolveInfo, fieldNodes?: FieldNode[]) => {
  const selectFields: FieldTree = {};
  for (const fieldNode of fieldNodes ?? info.fieldNodes) {
    for (const field of fieldNode.selectionSet!.selections) {
      getQueryFragment(info, selectFields, field);
    }
  }
  return selectFields;
};
