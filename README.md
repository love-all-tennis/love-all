# Love All

A tennis app for finding players at your level, setting up matches and hitting sessions, and talking in an open forum. v1 launches in the Detroit metro area.

The v1 spec lives in the project's spec doc. This repo holds everything: the Expo app, the API, and the shared API definitions.

## Layout

```
apps/
  mobile/      Expo app (Expo Router, Better Auth client, typed API client)
  api/         Effect v4 HTTP API, Better Auth, Drizzle + Postgres/PostGIS
packages/
  domain/      Schemas + HttpApi definitions shared by app and API
```

The API is defined once in `packages/domain`. The server implements it (`apps/api/src/Handlers.ts`) and the app gets a typed client from the same definition (`apps/mobile/src/lib/api.ts`), so a change to an endpoint is checked on both sides at compile time.

## Stack

| Piece    | Choice                                                                    |
| -------- | ------------------------------------------------------------------------- |
| App      | Expo SDK 58, Expo Router, TypeScript                                      |
| API      | Effect 4 (`effect/http-api`) on Node 22                                   |
| Database | Postgres 17 + PostGIS, Drizzle ORM (Effect driver, 1.0 release candidate) |
| Auth     | Better Auth, self-hosted inside the API, with the Expo plugin             |
| Tooling  | pnpm workspaces + Vite+ (`vp check`, `vp test`, `vp run`, `vp pack`)      |
| Deploy   | API Docker image on our VPS via Openship                                  |

## Getting started

Needs Node 22+, pnpm 10, Docker, and [Vite+](https://viteplus.dev) (`vp`).

```sh
pnpm install
cp .env.example .env                      # set BETTER_AUTH_SECRET (openssl rand -base64 32); loaded automatically
pnpm db:up                                # Postgres + PostGIS in Docker
pnpm db:migrate                           # apply migrations
pnpm dev:api                              # API on http://localhost:3000 (docs at /docs)
pnpm dev:mobile                           # Expo dev server
```

The API reads `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` and `PORT` from the environment. Google and Sign in with Apple turn on when their `GOOGLE_*` and `APPLE_*` variables are set (see `.env.example`); without them only email and password is offered. For local dev, `pnpm dev:api` and `pnpm db:migrate` load them from the root `.env` (via Node's `--env-file-if-exists`), and anything already exported in your shell wins. Tests don't read `.env`: the database tests run only when you export `DATABASE_URL` yourself. Docker Compose and production set the variables directly. On a phone, set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your machine's LAN address.

## Everyday commands

| Command                                     | What it does                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `vp check`                                  | Format check, lint, and type-aware lint across the repo                                       |
| `pnpm typecheck`                            | `tsc` in every package                                                                        |
| `vp test run`                               | Unit and in-memory API tests; with `DATABASE_URL` set, also the `*.db.test.ts` database tests |
| `pnpm --filter @love-all/api db:generate`   | New migration from schema changes                                                             |
| `pnpm --filter @love-all/api auth:generate` | Regenerate Better Auth's tables after changing auth config                                    |
| `docker compose up --build`                 | Run the whole API stack locally                                                               |

## Notes

- Better Auth's Drizzle adapter awaits promise-based queries, so it uses its own small `node-postgres` pool. App code uses Drizzle's Effect driver through the `Db` service. Both share one schema in `apps/api/src/db`.
- Player locations are stored rounded to two decimals (about 1 km) and a check constraint enforces it. Round with `roundHomePoint` in `apps/api/src/db/geo.ts` before writing `profile.home_point`.
- Players must confirm they're 18 or older. The sign-up screen asks with a checkbox, and anyone who signs in without having confirmed (a first Google or Apple sign-in, say) lands on the confirm-age screen. The answer is stored as `user.adult_confirmed_at` through `POST /me/adult-confirmation`, and the app only opens once it's set.
- Auth lives at `/api/auth/*`. Endpoints behind the `Authentication` middleware get the signed-in user as `CurrentUser`, and a missing or expired session is a 401 `Unauthorized`. Every user has a `role` (`player` by default, or `admin`). It can't be set through Better Auth's sign-up or update routes, so promote an admin in the database: `update "user" set role = 'admin' where email = '...'`.
- The API image bundles all dependencies (`vp pack`), runs migrations on start, then serves.
- The Expo app builds with Metro. Vite+ is used for the API and shared packages, and for linting and formatting everywhere.
- `GET /me` returns the account, the profile (`null` until the first `PATCH /me`) and weekly availability. `PATCH /me` changes only the fields sent and creates the profile on first save. The metro is never sent by the app: the API sets it from the home point (the launch area whose radius covers it). `PUT /me/availability` replaces the whole weekly schedule. Profile reads and writes go through the `Profiles` service (`apps/api/src/Profiles.ts`); handler tests use `ProfilesMemory` instead of a database.
- Players can block each other (`POST`/`DELETE /players/:id/block`, listed at `GET /me/blocks`) and report a player (`POST /reports`, which files an `open` row in `report` for moderators). A block hides both players from each other, whoever blocked: any query that returns other players, or their posts, sessions or messages, must add `notBlocked(viewer.id, <their user id column>)` from `apps/api/src/db/blocks.ts` to its `where`. Player search, `GET /players/:id` and follows already do, and blocking also removes any follow between the two players, both ways. Reports keep `reporter_id` as null if the reporter deletes their account, so moderation history stays.
- Sessions (matches and hitting sessions) live in `play_session`, with one `play_session_participant` row per player, the host included as `host` / `accepted`. Only `accepted` rows take a spot. The rules for who sees a session are in one place, `canSee` in `apps/api/src/Sessions.ts`: players in it see it, and anyone else only while it is `open`, not cancelled, and its level range includes their NTRP; a host blocked either way is never shown. Court pins are public places, so they're stored as given; a session with no pin is placed at the host's rounded home point for `nearby` and `distanceKm`. `GET /sessions?scope=mine` lists upcoming sessions (not yet ended) soonest first, then past ones latest first.
- The forum has global categories (General, Find a partner, Gear talk, Technique) and one Local category per metro (`forum_category.metro_id`, Detroit Local is seeded). Players only see, and post in, the Local category for their profile's metro. A thread's opening text lives on `forum_thread`; replies are `forum_post` rows, and each reply bumps the thread's `last_post_at` and `reply_count` in the same transaction. Deletes are soft (`deleted_at`): a deleted thread drops out, a deleted reply stays as "Post deleted". `hidden_at` is for moderators and hides either for everyone. Who sees what lives in `visibleThread` in `apps/api/src/Forum.ts`, which also applies `notBlocked`. Posting is limited per hour (`FORUM_THREADS_PER_HOUR`, `FORUM_REPLIES_PER_HOUR` in the domain).
