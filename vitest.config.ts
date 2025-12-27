import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/tools/seed.ts"],
  },
});
