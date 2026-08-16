import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts"],
    setupFiles: ["test/setup.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/trophy/**/*.ts", "server/utils/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
