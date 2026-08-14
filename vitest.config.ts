import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Node environment only: everything under test is schema validation and
 * server-side service logic. No component tests, so no jsdom dependency.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  }
});
