import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts", "src/migrate.ts"],
    format: ["esm"],
    platform: "node",
    target: "node22",
    sourcemap: true,
    dts: false,
    deps: { alwaysBundle: [/.*/] },
  },
  test: {
    include: ["src/**/*.test.ts"],
    alias: { vitest: "vite-plus/test" },
    server: { deps: { inline: ["@better-auth/test-utils"] } },
  },
});
