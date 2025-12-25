import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./test/drizzle",
  schema: "./test/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    schema: "public",
  },
});
