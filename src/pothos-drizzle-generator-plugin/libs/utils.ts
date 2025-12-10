export const createInputOperator = (
  builder: PothosSchemaTypes.SchemaBuilder<any>,
  type: String | [String]
) => {
  const typeName = Array.isArray(type) ? `Array${type[0]}` : type;
  const name = `${typeName}InputOperator`;
  const inputType = builder.inputType(name, {
    fields: (t) => ({
      eq: t.field({ type: type as never }),
      ne: t.field({ type: type as never }),
      gt: t.field({ type: type as never }),
      gte: t.field({ type: type as never }),
      lt: t.field({ type: type as never }),
      lte: t.field({ type: type as never }),
      like: t.field({ type: type as never }),
      notLike: t.field({ type: type as never }),
      ilike: t.field({ type: type as never }),
      notIlike: t.field({ type: type as never }),
      isNull: t.boolean(),
      isNotNull: t.boolean(),
      in: t.field({ type: [type] as never }),
      notIn: t.field({ type: [type] as never }),
      arrayContained: t.field({ type: [type] as never }),
      arrayOverlaps: t.field({ type: [type] as never }),
      arrayContains: t.field({ type: [type] as never }),
    }),
  });
  return inputType;
};

type AggregationQueryType = {
  aggregation?: boolean;
  columns?: object;
  with: Record<string, AggregationQueryType>;
};

export const convertAggregationQuery = (query: AggregationQueryType) => {
  const { aggregation, columns, ...q } = query;
  const newQuery = aggregation ? { ...q, columns: {} } : query;
  const newWith: Record<string, AggregationQueryType> = query.with
    ? Object.fromEntries(
        Object.entries(query.with).map(([key, value]) => [
          key,
          convertAggregationQuery(value),
        ])
      )
    : query.with;

  return { ...newQuery, with: newWith };
};
