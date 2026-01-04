import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { reset, seed } from "drizzle-seed";
import { relations } from "../db/relations.js";
import * as schema from "../db/schema.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const url = new URL(connectionString);
  const searchPath = url.searchParams.get("schema") ?? "public";
  const db = drizzle({
    connection: {
      connectionString,
      options: `--search_path=${searchPath}`,
    },
    relations,
  });
  // await db.execute(`drop schema ${searchPath} cascade`).catch(() => {});
  await migrate(db, { migrationsFolder: "./test/drizzle", migrationsSchema: searchPath });
  await db.transaction(async (tx) => {
    await reset(tx, schema);
    await seed(tx, Object.fromEntries(Object.entries(schema).filter(([k]) => k !== "test")));
  });
  await db.$client.end();
}
main();
