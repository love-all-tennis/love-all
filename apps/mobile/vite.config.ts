import { defineConfig } from "vite-plus";

// The app builds with Metro. This config is only for unit tests of plain
// TypeScript modules (no React Native imports).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
