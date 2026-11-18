import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    plugins: ["typescript"],
    jsPlugins: [
      { name: "landmines-testing", specifier: "@interfere/landmines/testing" },
      { name: "landmines-style", specifier: "@interfere/landmines/style" },
      { name: "landmines-structure", specifier: "@interfere/landmines/structure" },
      { name: "landmines-types", specifier: "@interfere/landmines/types" },
    ],
    rules: {
      "landmines-testing/no-fixed-sleep": "error",
      "landmines-testing/no-flake-masking": "error",
      "landmines-testing/no-test-doubles": "error",
      "landmines-testing/no-unsignaled-poll": "error",
      "landmines-testing/strict-msw": "error",
      "landmines-style/no-comments": "error",
      "landmines-structure/colocated-tests": "error",
      "landmines-structure/package-exports": "error",
      "landmines-structure/test-file-names": "error",
      "landmines-types/no-explicit-return-types": "error",
    },
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
