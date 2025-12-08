import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const db = drizzle({
  connection: process.env.DATABASE_URL!,
});

const main = async () => {
  await db.execute("drop schema public cascade");
  await db.execute("create schema public");
  db.$client.end();
  console.log("reset");
};

main();
