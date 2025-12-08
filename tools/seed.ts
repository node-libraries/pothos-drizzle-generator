import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { reset, seed } from "drizzle-seed";
import * as schema from "../src/db/schema";
import { relations } from "../src/db/relations";

async function main() {
  const db = drizzle(process.env.DATABASE_URL!, { relations });
  await reset(db, schema);
  await seed(db, schema);
  db.$client.end();
}
main();
