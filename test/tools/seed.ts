import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
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
  await reset(db, schema);
  await seed(db, schema);
  db.$client.end();
  console.log(`seed ${searchPath}`);
}
main();
