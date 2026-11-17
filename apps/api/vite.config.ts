import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts", "src/migrate.ts"],
    format: ["esm"],
    platform: "node",
    target: "node22",
    sourcemap: true,
    dts: false,
    // Bundle every dependency, so the production image needs no node_modules.
    deps: { alwaysBundle: [/.*/] },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Better Auth's adapter test suite imports `vitest`; point it at the runner
    // Vite+ uses, so its tests register with this run.
    alias: { vitest: "vite-plus/test" },
    server: { deps: { inline: ["@better-auth/test-utils"] } },
  },
});
