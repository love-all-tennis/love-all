import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["**/dist/**", "**/.expo/**", "apps/api/drizzle/**"],
    overrides: [
      {
        files: ["apps/mobile/**"],
        plugins: ["react"],
      },
      {
        files: ["apps/api/**"],
        env: { node: true },
      },
    ],
  },
  fmt: {
    ignorePatterns: ["apps/api/drizzle/**", "pnpm-lock.yaml"],
  },
  test: {
    projects: ["packages/*", "apps/api", "apps/mobile"],
  },
});
