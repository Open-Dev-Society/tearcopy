import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["packages/tearcopy/src/**/*.test.ts"],
  },
});
