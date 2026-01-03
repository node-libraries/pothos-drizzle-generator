import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { graphql: "graphql/index.js" } },
  test: {
    fileParallelism: false,
    include: ["test/tests/*.test.ts"],
    setupFiles: ["test/tools/seed.ts"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/global-types.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "./test/coverage",
    },
  },
});
