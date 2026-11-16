# Love All

A tennis app for adult players in the Detroit metro: find players at your level, set up matches and hitting sessions, talk in the forum, and message each other. See README.md for the layout, stack and commands.

- `apps/mobile`: the Expo app. Read `apps/mobile/AGENTS.md` before changing it.
- `apps/api`: the Effect 4 HTTP API, Better Auth, Drizzle and Postgres.
- `packages/domain`: schemas and the HttpApi definition shared by the app and the API.

## Design

Any work on app screens follows `docs/design.md` and builds from the design system in `apps/mobile/src/design` (imported as `@/design`). Read the doc before you design, build or restyle a screen.

## Before you finish

Run `pnpm exec vp check`, `pnpm typecheck` and `pnpm exec vp test run` from the repo root.
