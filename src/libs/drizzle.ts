import * as p from "drizzle-orm";

const OperatorMap = {
  eq: p.eq,
  ne: p.ne,
  gt: p.gt,
  gte: p.gte,
  lt: p.lt,
  lte: p.lte,
  like: p.like,
  notLike: p.notLike,
  ilike: p.ilike,
  notIlike: p.notIlike,
  isNull: p.isNull,
  isNotNull: p.isNotNull,
  in: p.inArray,
  notIn: p.notInArray,
  arrayContained: p.arrayContained,
  arrayOverlaps: p.arrayOverlaps,
  arrayContains: p.arrayContains,
};

type PartialRecord<K extends PropertyKey, T> = {
  [P in K]?: T;
};

type OperatorType = PartialRecord<string, PartialRecord<keyof typeof OperatorMap, unknown>>;
type OperatorTree =
  | PartialRecord<"AND" | "OR", OperatorTree[]>
  | { NOT?: OperatorTree }
  | OperatorType;

export const getColumn = (col: unknown): p.Column => {
  return ((col as { _?: { column?: p.Column } })._?.column ?? col) as p.Column;
};

export const createWhereQuery = (table: p.SchemaEntry, tree?: OperatorTree): p.SQL | undefined => {
  if (!tree) return undefined;
  const tableColumns = p.getColumns(table);
  const result: p.SQL[] = Object.entries(tree)
    .map(([key, value]) => {
      switch (key) {
        case "AND":
          return value.length
            ? p.and(...value.map((v: OperatorTree) => createWhereQuery(table, v)))
            : undefined;
        case "OR":
          return value.length
            ? p.or(...value.map((v: OperatorTree) => createWhereQuery(table, v)))
            : undefined;
        case "NOT": {
          const v = createWhereQuery(table, value);
          return v ? p.not(v) : undefined;
        }
      }
      const column = tableColumns[key];
      if (!column) return undefined;

      const result =
        typeof value === "object" && value !== null
          ? Object.entries(value).map(([k, v]) => {
              if (k === "isNull") {
                return v ? p.isNull(column) : p.isNotNull(column);
              }
              if (k === "isNotNull") {
                return v ? p.isNotNull(column) : p.isNull(column);
              }
              const op = OperatorMap[k as keyof typeof OperatorMap];
              if (!op) return undefined;
              return (op as (col: p.SQL | p.Column, val: unknown) => p.SQL)(column, v);
            }).filter((sql): sql is p.SQL => sql !== undefined)
          : [p.eq(column, value)];
      if (result.length === 1) {
        return result[0];
      }
      if (result.length > 1) {
        return p.and(...result);
      }
      return undefined;
    })
    .flatMap((v) => (v ? [v] : []));
  if (result.length === 1) return result[0] as p.SQL;
  if (result.length > 1) return p.and(...result);
  return undefined;
};
