import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { graphql: "graphql/index.js" } },
  test: {
    maxWorkers: "100%",
    include: ["test/**/*.test.ts"],
    typecheck: {
      enabled: true,
    },
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/global-types.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "./test/coverage",
    },
  },
});
