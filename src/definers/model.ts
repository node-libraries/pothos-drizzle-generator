import { and, eq, sql, type AnyRelation, type Table } from "drizzle-orm";
import { type ModelData, DrizzleGenerator } from "../generator.js";
import { createWhereQuery, getColumn } from "../libs/drizzle.js";
import { checkPermissionsAndGetParams } from "../libs/permissions.js";
import { combineWhere } from "../libs/resolver-helpers.js";
import type { SchemaTypes } from "@pothos/core";
import type { DrizzleObjectFieldBuilder } from "@pothos/plugin-drizzle";

export function defineModelObject<Types extends SchemaTypes>(
  builder: PothosSchemaTypes.SchemaBuilder<Types>,
  generator: DrizzleGenerator<Types>,
  modelName: string,
  modelData: ModelData,
  tables: Record<string, ModelData>
) {
  const { relations, columns, filterColumns, tableSingularAlias } = modelData;

  const filterRelations = Object.entries(relations).filter(
    ([, relay]) => tables[relay.targetTableName]
  );

  builder.drizzleObject(modelName as never, {
    name: tableSingularAlias,
    fields: (t) => {
      const relayList = filterRelations
        .filter(([name]) => filterColumns.includes(name))
        .map(([relayName, relay]) =>
          createRelationField(t as never, generator, relayName, relay, tables)
        );

      const relayCount = filterRelations
        .filter(([name]) => filterColumns.includes(`${name}Count`))
        .map(([relayName, relay]) =>
          createRelationCountField(t as never, generator, relayName, relay, tables)
        );
      const columnList = columns
        .filter(({ name }) => filterColumns.includes(name))
        .map((c) => [
          c.name,
          t.expose(c.name, {
            type: generator.getDataType(c),
            nullable: !c.notNull,
          } as never),
        ]);

      return Object.fromEntries([...relayCount, ...relayList, ...columnList]);
    },
  });
}

function createRelationField<Types extends SchemaTypes, Shape>(
  t: DrizzleObjectFieldBuilder<Types, Types["DrizzleRelations"][string], Shape>,
  generator: DrizzleGenerator<Types>,
  relayName: string,
  relay: AnyRelation,
  tables: Record<string, ModelData>
) {
  const targetModelName = relay.targetTableName;
  const { operations } = tables[targetModelName]!;
  const operation = relay.relationType === "one" ? "findFirst" : "findMany";

  if (!operations.includes(operation)) return [];

  const inputWhere = generator.getInputWhere(targetModelName);
  const inputOrderBy = generator.getInputOrderBy(targetModelName);

  return [
    relayName,
    t.relation(relayName, {
      nullable: relay.relationType === "one",
      args: {
        offset: t.arg({ type: "Int" }),
        limit: t.arg({ type: "Int" }),
        where: t.arg({ type: inputWhere }),
        orderBy: t.arg({ type: [inputOrderBy] }),
      },
      query: (
        args: {
          where?: object;
          offset?: number;
          limit?: number;
          orderBy?: object[];
        },
        ctx: object
      ) => {
        const params = checkPermissionsAndGetParams(
          targetModelName,
          operation,
          ctx,
          null,
          tables[targetModelName]!
        );

        const where = combineWhere(args.where, params.where);
        const requestedLimit = args.limit != null ? Math.max(0, args.limit) : undefined;
        const limit =
          params.limit != null && requestedLimit != null
            ? Math.min(params.limit, requestedLimit)
            : (params.limit ?? requestedLimit);
        const offset = args.offset != null ? Math.max(0, args.offset) : undefined;

        const queryOptions: Record<string, unknown> = {
          ...args,
          _name: targetModelName,
          limit,
          offset,
          orderBy:
            args.orderBy && Object.keys(args.orderBy).length
              ? Object.fromEntries(args.orderBy.flatMap((v) => Object.entries(v)))
              : params.orderBy,
        };
        if (where) {
          queryOptions.where = where;
        } else {
          delete queryOptions.where;
        }

        return queryOptions;
      },
    } as never),
  ];
}

function createRelationCountField<Types extends SchemaTypes, Shape>(
  t: DrizzleObjectFieldBuilder<Types, Types["DrizzleRelations"][string], Shape>,
  generator: DrizzleGenerator<Types>,
  relayName: string,
  relay: AnyRelation,
  tables: Record<string, ModelData>
) {
  const targetModelName = relay.targetTableName;
  const operation = "count";
  const { operations } = tables[targetModelName]!;

  if (!operations.includes(operation)) return [];

  const inputWhere = generator.getInputWhere(targetModelName);

  return [
    `${relayName}Count`,
    t.field({
      type: "Int",
      nullable: false,
      args: { where: t.arg({ type: inputWhere }) },
      extensions: {
        pothosDrizzleSelect: (args: { where?: object }, ctx: object) => {
          const params = checkPermissionsAndGetParams(
            targetModelName,
            operation,
            ctx,
            null,
            tables[targetModelName]!
          );

          return {
            columns: {},
            extras: {
              [`${relayName}Count`]: (table: Table) => {
                const client = generator.getClient(ctx);
                if (relay.throughTable) {
                  return client
                    .select({ count: sql`count(*)` })
                    .from(relay.targetTable as never)
                    .leftJoin(
                      relay.throughTable as never,
                      and(
                        ...relay.targetColumns.map((v, index) =>
                          eq(relay.through!.target[index]!._.column, getColumn(v))
                        )
                      )
                    )
                    .where(
                      and(
                        ...relay.sourceColumns.map((v, index) => {
                          const col = getColumn(v);
                          return eq(
                            relay.through!.source[index]!._.column,
                            table[col.name as keyof typeof table]
                          );
                        }),
                        createWhereQuery(relay.targetTable, combineWhere(args.where, params.where) as never)
                      )
                    );
                } else {
                  return client
                    .select({ count: sql`count(*)` })
                    .from(relay.targetTable as never)
                    .where(
                      and(
                        ...relay.sourceColumns.map((v, index) => {
                          const sourceCol = getColumn(v);
                          const targetCol = getColumn(relay.targetColumns[index]);
                          return eq(
                            targetCol,
                            table[sourceCol.name as keyof typeof table]
                          );
                        }),
                        createWhereQuery(relay.targetTable, combineWhere(args.where, params.where) as never)
                      )
                    );
                }
              },
            },
          };
        },
      },
    } as never),
  ];
}
