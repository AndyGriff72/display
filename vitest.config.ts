import { defineConfig } from "vitest/config";

// Kept apart from vite.config.ts so the tests do not load the Laravel plugin.
export default defineConfig({
  test: {
    include: ["resources/js/**/*.test.ts"],
  },
});
