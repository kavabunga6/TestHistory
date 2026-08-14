import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "dist-types/**", "node_modules/**"],
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"]
  }
});
