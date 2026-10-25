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
  contains: (col: p.SQL | p.Column, val: unknown) => p.like(col, `%${val}%`),
  notContains: (col: p.SQL | p.Column, val: unknown) => p.notLike(col, `%${val}%`),
  startsWith: (col: p.SQL | p.Column, val: unknown) => p.like(col, `${val}%`),
  endsWith: (col: p.SQL | p.Column, val: unknown) => p.like(col, `%${val}`),
  icontains: (col: p.SQL | p.Column, val: unknown) => p.ilike(col, `%${val}%`),
  notIcontains: (col: p.SQL | p.Column, val: unknown) => p.notIlike(col, `%${val}%`),
  istartsWith: (col: p.SQL | p.Column, val: unknown) => p.ilike(col, `${val}%`),
  iendsWith: (col: p.SQL | p.Column, val: unknown) => p.ilike(col, `%${val}`),
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

export const createWhereQuery = (
  table: p.SchemaEntry,
  tree?: OperatorTree,
  relations?: p.RelationsRecord,
  allRelations?: p.AnyRelations
): p.SQL | undefined => {
  if (!tree) return undefined;
  const tableColumns = p.getColumns(table);
  const result: p.SQL[] = Object.entries(tree)
    .map(([key, value]) => {
      switch (key) {
        case "AND":
          return value.length
            ? p.and(
                ...value.map((v: OperatorTree) =>
                  createWhereQuery(table, v, relations, allRelations)
                )
              )
            : undefined;
        case "OR":
          return value.length
            ? p.or(
                ...value.map((v: OperatorTree) =>
                  createWhereQuery(table, v, relations, allRelations)
                )
              )
            : undefined;
        case "NOT": {
          const v = createWhereQuery(table, value, relations, allRelations);
          return v ? p.not(v) : undefined;
        }
      }
      const column = tableColumns[key];
      if (!column) {
        const relay = relations?.[key];
        if (relay && typeof value === "object" && value !== null) {
          const targetRelations = allRelations?.[relay.targetTableName]?.relations;
          const targetWhere = createWhereQuery(
            relay.targetTable,
            value as OperatorTree,
            targetRelations,
            allRelations
          );
          if (relay.throughTable && relay.through) {
            const throughTargetJoin = p.and(
              ...relay.targetColumns.map((v, index) =>
                p.eq(relay.through!.target[index]!._.column, getColumn(v))
              )
            );
            const throughSourceJoin = p.and(
              ...relay.sourceColumns.map((v, index) => {
                const col = getColumn(v);
                return p.eq(relay.through!.source[index]!._.column, tableColumns[col.name]!);
              })
            );
            const whereParts = [throughSourceJoin, targetWhere].filter(
              (sql): sql is p.SQL => sql !== undefined
            );
            return p.exists(
              p.sql`(SELECT 1 FROM ${relay.targetTable} INNER JOIN ${relay.throughTable} ON ${throughTargetJoin} WHERE ${p.and(...whereParts)})`
            );
          } else {
            const joinConditions = p.and(
              ...relay.sourceColumns.map((src, i) => {
                const srcCol = getColumn(src);
                const targetCol = getColumn(relay.targetColumns[i]);
                return p.eq(targetCol, tableColumns[srcCol.name]!);
              })
            );
            const whereParts = [joinConditions, targetWhere].filter(
              (sql): sql is p.SQL => sql !== undefined
            );
            return p.exists(
              p.sql`(SELECT 1 FROM ${relay.targetTable} WHERE ${p.and(...whereParts)})`
            );
          }
        }
        return undefined;
      }

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
