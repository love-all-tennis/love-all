import {
  HomePointRequired,
  InvalidCursor,
  InvalidSession,
  type NewSession,
  NotSessionHost,
  type Ntrp,
  PlayerNotFound,
  ProfileRequired,
  SESSIONS_PAGE_DEFAULT,
  Session,
  SessionClosed,
  SessionFull,
  type SessionInvites,
  SessionNotFound,
  SessionParticipant,
  type SessionPatch,
  SessionPlayer,
  SessionsPage,
  type SessionsQuery,
  SessionSummary,
  type SessionUser,
  defaultSpots,
  spotsFitKind,
} from "@love-all/domain";
import { type SQL, and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Clock, Context, Effect, Layer, Option } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import type { LngLat } from "./db/geo";
import { playSession, playSessionParticipant, profile } from "./db/schema";
import { Notifications } from "./Notifications";
import { messages } from "./notifications/messages";
import { displayKm } from "./players/cursor";
import { decodeCursor, encodeCursor } from "./sessions/cursor";

/**
 * Matches and hitting sessions: creating, editing, listing and inviting.
 * Join, approve and leave (#14) and comments and scores (#15) build on the
 * same tables and `visibleSession`.
 *
 * Visibility rules, in one place (`canSee`):
 * - Players in a session (any state) can see it.
 * - Anyone else can see it only while it is `open` to nearby players, not
 *   cancelled, and its level range includes their NTRP.
 * - Nobody sees a session whose host is blocked with them either way, and
 *   participants blocked with the viewer are left out of the player list.
 *
 * Database failures are defects (a 500), as in `Profiles`.
 */
export class Sessions extends Context.Service<
  Sessions,
  {
    readonly create: (
      viewer: SessionUser,
      input: NewSession,
    ) => Effect.Effect<Session, InvalidSession | ProfileRequired>;
    readonly get: (viewer: SessionUser, id: string) => Effect.Effect<Session, SessionNotFound>;
    readonly update: (
      viewer: SessionUser,
      id: string,
      patch: SessionPatch,
    ) => Effect.Effect<Session, SessionNotFound | NotSessionHost | SessionClosed | InvalidSession>;
    readonly list: (
      viewer: SessionUser,
      query: SessionsQuery,
    ) => Effect.Effect<SessionsPage, HomePointRequired | InvalidCursor>;
    readonly invite: (
      viewer: SessionUser,
      id: string,
      invites: SessionInvites,
    ) => Effect.Effect<
      Session,
      | SessionNotFound
      | NotSessionHost
      | SessionClosed
      | SessionFull
      | PlayerNotFound
      | InvalidSession
    >;
  }
>()("love-all/Sessions") {
  static readonly layer = Layer.effect(
    Sessions,
    Effect.gen(function* () {
      const db = yield* Db;
      const notifications = yield* Notifications;
      const hostProfile = alias(profile, "host_profile");
      const mine = alias(playSessionParticipant, "mine");

      const now = Clock.currentTimeMillis.pipe(Effect.map((ms) => new Date(ms)));

      const viewerProfile = (viewer: SessionUser) =>
        db
          .select({
            homePoint: profile.homePoint,
            searchRadiusKm: profile.searchRadiusKm,
            ntrp: profile.ntrp,
          })
          .from(profile)
          .where(eq(profile.userId, viewer.id))
          .pipe(
            Effect.map(([row]) => row),
            Effect.orDie,
          );

      const geographyOf = (point: LngLat) =>
        sql`ST_SetSRID(ST_MakePoint(${point.x}, ${point.y}), 4326)::geography`;

      /** The court pin, or the host's home point when there is no pin. */
      const sessionPoint = sql`coalesce(${playSession.courtPoint}, ${hostProfile.homePoint})`;

      /** Metres from `point` to where the session is, or null when it has no location. */
      const distanceFrom = (point: LngLat | null | undefined) =>
        (point
          ? sql`ST_Distance(${sessionPoint}::geography, ${geographyOf(point)})`
          : sql`null::float8`
        ).mapWith((value): number | null => (value === null ? null : Number(value)));

      const acceptedCount = sql<number>`(
        select count(*)::int from ${playSessionParticipant}
        where ${playSessionParticipant.sessionId} = ${playSession.id}
          and ${playSessionParticipant.state} = 'accepted'
      )`.mapWith(Number);

      /** Players waiting on the host's answer. Only the host sees the count; others get 0. */
      const requestCount = sql<number>`case when ${mine.role} = 'host' then (
        select count(*)::int from ${playSessionParticipant}
        where ${playSessionParticipant.sessionId} = ${playSession.id}
          and ${playSessionParticipant.state} = 'requested'
      ) else 0 end`.mapWith(Number);

      /** True when the session's level range includes `ntrp`. No rating fits only "any level". */
      const levelIncludes = (ntrp: Ntrp | null | undefined): SQL =>
        ntrp
          ? and(
              or(isNull(playSession.levelMin), lte(playSession.levelMin, ntrp)),
              or(isNull(playSession.levelMax), gte(playSession.levelMax, ntrp)),
            )!
          : and(isNull(playSession.levelMin), isNull(playSession.levelMax))!;

      /** Who may see a session at all. Needs the `mine` join. */
      const canSee = (viewer: SessionUser, ntrp: Ntrp | null | undefined): Array<SQL> => [
        notBlocked(viewer.id, playSession.hostId),
        or(
          sql`${mine.userId} is not null`,
          and(
            eq(playSession.visibility, "open"),
            ne(playSession.status, "cancelled"),
            levelIncludes(ntrp),
          ),
        )!,
      ];

      const summarySelect = (viewer: SessionUser, home: LngLat | null | undefined) =>
        db
          .select({
            id: playSession.id,
            kind: playSession.kind,
            startsAt: playSession.startsAt,
            durationMinutes: playSession.durationMinutes,
            courtName: playSession.courtName,
            courtPoint: playSession.courtPoint,
            levelMin: playSession.levelMin,
            levelMax: playSession.levelMax,
            spots: playSession.spots,
            acceptedCount,
            requestCount,
            visibility: playSession.visibility,
            status: playSession.status,
            notes: playSession.notes,
            createdAt: playSession.createdAt,
            host: {
              id: hostProfile.userId,
              displayName: hostProfile.displayName,
              photoUrl: hostProfile.photoUrl,
              ntrp: hostProfile.ntrp,
            },
            me: { role: mine.role, state: mine.state },
            distanceM: distanceFrom(home),
          })
          .from(playSession)
          .innerJoin(hostProfile, eq(hostProfile.userId, playSession.hostId))
          .leftJoin(mine, and(eq(mine.sessionId, playSession.id), eq(mine.userId, viewer.id)));

      type Row = Effect.Success<ReturnType<typeof summarySelect>>[number];

      const toFields = ({ distanceM, courtPoint, host, createdAt: _createdAt, ...row }: Row) => ({
        ...row,
        courtPoint: courtPoint && { lat: courtPoint.y, lng: courtPoint.x },
        host: new SessionPlayer(host),
        distanceKm: distanceM === null ? null : displayKm(distanceM),
      });

      /** The session as `viewer` may see it, or none. */
      const visibleSession = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          const me = yield* viewerProfile(viewer);
          const [row] = yield* summarySelect(viewer, me?.homePoint)
            .where(and(eq(playSession.id, id), ...canSee(viewer, me?.ntrp)))
            .pipe(Effect.orDie);
          return Option.fromNullishOr(row);
        });

      const participantsOf = (viewer: SessionUser, row: Row) => {
        const isHost = row.host.id === viewer.id;
        return db
          .select({
            player: {
              id: profile.userId,
              displayName: profile.displayName,
              photoUrl: profile.photoUrl,
              ntrp: profile.ntrp,
            },
            role: playSessionParticipant.role,
            state: playSessionParticipant.state,
          })
          .from(playSessionParticipant)
          .innerJoin(profile, eq(profile.userId, playSessionParticipant.userId))
          .where(
            and(
              eq(playSessionParticipant.sessionId, row.id),
              notBlocked(viewer.id, playSessionParticipant.userId),
              isHost
                ? undefined
                : or(
                    inArray(playSessionParticipant.state, ["accepted", "invited"]),
                    eq(playSessionParticipant.userId, viewer.id),
                  ),
            ),
          )
          .orderBy(
            sql`${playSessionParticipant.role} = 'host' desc`,
            asc(playSessionParticipant.state),
            asc(playSessionParticipant.createdAt),
            asc(playSessionParticipant.userId),
          )
          .pipe(
            Effect.map((rows) =>
              rows.map(
                ({ player, ...rest }) =>
                  new SessionParticipant({ player: new SessionPlayer(player), ...rest }),
              ),
            ),
            Effect.orDie,
          );
      };

      const detail = (viewer: SessionUser, row: Row) =>
        participantsOf(viewer, row).pipe(
          Effect.map(
            (participants) =>
              new Session({ ...toFields(row), participants, createdAt: row.createdAt }),
          ),
        );

      const get = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          const row = yield* visibleSession(viewer, id);
          if (Option.isNone(row)) return yield* new SessionNotFound({ id });
          return yield* detail(viewer, row.value);
        }).pipe(Effect.withSpan("Sessions.get"));

      /** For host-only changes: the session, if the viewer can see it and hosts it. */
      const hostedSession = (viewer: SessionUser, id: string) =>
        Effect.gen(function* () {
          const found = yield* visibleSession(viewer, id);
          if (Option.isNone(found)) return yield* new SessionNotFound({ id });
          const row = found.value;
          if (row.host.id !== viewer.id) {
            return yield* new NotSessionHost({ message: "Only the host can change this session" });
          }
          if (row.status === "cancelled") {
            return yield* new SessionClosed({ message: "This session was cancelled" });
          }
          if (row.startsAt.getTime() <= (yield* now).getTime()) {
            return yield* new SessionClosed({ message: "This session has already started" });
          }
          return row;
        });

      const toPoint = (point: { lat: number; lng: number } | null | undefined) =>
        point ? { x: point.lng, y: point.lat } : null;

      const create = (viewer: SessionUser, input: NewSession) =>
        Effect.gen(function* () {
          if (input.startsAt.getTime() <= (yield* now).getTime()) {
            return yield* new InvalidSession({ message: "Pick a start time in the future" });
          }
          const me = yield* viewerProfile(viewer);
          if (!me) {
            return yield* new ProfileRequired({ message: "Set up your profile before hosting" });
          }
          const id = yield* db
            .transaction((tx) =>
              Effect.gen(function* () {
                const [created] = yield* tx
                  .insert(playSession)
                  .values({
                    hostId: viewer.id,
                    kind: input.kind,
                    startsAt: input.startsAt,
                    durationMinutes: input.durationMinutes,
                    courtName: input.courtName,
                    courtPoint: toPoint(input.courtPoint),
                    levelMin: input.levelMin ?? null,
                    levelMax: input.levelMax ?? null,
                    spots: input.spots ?? defaultSpots(input.kind),
                    visibility: input.visibility,
                    notes: input.notes ?? null,
                  })
                  .returning({ id: playSession.id });
                yield* tx.insert(playSessionParticipant).values({
                  sessionId: created!.id,
                  userId: viewer.id,
                  role: "host",
                  state: "accepted",
                });
                return created!.id;
              }),
            )
            .pipe(Effect.orDie);
          return yield* get(viewer, id).pipe(Effect.orDie);
        }).pipe(Effect.withSpan("Sessions.create"));

      const update = (viewer: SessionUser, id: string, patch: SessionPatch) =>
        Effect.gen(function* () {
          const row = yield* hostedSession(viewer, id);
          if (patch.startsAt && patch.startsAt.getTime() <= (yield* now).getTime()) {
            return yield* new InvalidSession({ message: "Pick a start time in the future" });
          }
          const levelMin = patch.levelMin === undefined ? row.levelMin : patch.levelMin;
          const levelMax = patch.levelMax === undefined ? row.levelMax : patch.levelMax;
          if (levelMin !== null && levelMax !== null && levelMin > levelMax) {
            return yield* new InvalidSession({ message: "levelMin can't be above levelMax" });
          }
          const spots = patch.spots ?? row.spots;
          if (!spotsFitKind(row.kind, spots)) {
            return yield* new InvalidSession({
              message: `A ${row.kind} session has ${defaultSpots(row.kind)} spots`,
            });
          }
          if (spots < row.acceptedCount) {
            return yield* new InvalidSession({
              message: `${row.acceptedCount} players are already in; spots can't go below that`,
            });
          }

          const { courtPoint, startsAt, ...rest } = patch;
          yield* db
            .update(playSession)
            .set({
              ...rest,
              // A new start time gets a new "starting soon" reminder.
              ...(startsAt === undefined ? {} : { startsAt, reminderSentAt: null }),
              ...(courtPoint === undefined ? {} : { courtPoint: toPoint(courtPoint) }),
              // More or fewer spots can fill a session or open one up again.
              ...(patch.spots === undefined
                ? {}
                : { status: row.acceptedCount >= spots ? "confirmed" : "open" }),
            })
            .where(eq(playSession.id, id))
            .pipe(Effect.orDie);
          return yield* get(viewer, id).pipe(Effect.orDie);
        }).pipe(Effect.withSpan("Sessions.update"));

      const invite = (viewer: SessionUser, id: string, invites: SessionInvites) =>
        Effect.gen(function* () {
          const row = yield* hostedSession(viewer, id);
          if (row.acceptedCount >= row.spots) {
            return yield* new SessionFull({ message: "Every spot is taken" });
          }
          const ids = [...new Set(invites.playerIds)];
          if (ids.includes(viewer.id)) {
            return yield* new InvalidSession({ message: "You're already in this session" });
          }
          // Blocked players look the same as missing ones, as everywhere else.
          const found = yield* db
            .select({ id: profile.userId })
            .from(profile)
            .where(and(inArray(profile.userId, ids), notBlocked(viewer.id, profile.userId)))
            .pipe(Effect.orDie);
          const foundIds = new Set(found.map((p) => p.id));
          const missing = ids.find((playerId) => !foundIds.has(playerId));
          if (missing !== undefined) return yield* new PlayerNotFound({ id: missing });

          const invited = yield* db
            .insert(playSessionParticipant)
            .values(ids.map((userId) => ({ sessionId: id, userId, state: "invited" as const })))
            .onConflictDoNothing()
            .returning({ userId: playSessionParticipant.userId })
            .pipe(Effect.orDie);
          // Only players new to the session hear about it.
          yield* notifications.notify({
            to: invited.map((p) => p.userId),
            from: viewer.id,
            ...messages.invited({ ...row, id }, row.host.displayName),
          });
          return yield* get(viewer, id).pipe(Effect.orDie);
        }).pipe(Effect.withSpan("Sessions.invite"));

      const list = (viewer: SessionUser, query: SessionsQuery) =>
        Effect.gen(function* () {
          const me = yield* viewerProfile(viewer);
          if (query.scope === "nearby" && !me?.homePoint) {
            return yield* new HomePointRequired({
              message: "Set your home location to find sessions near you",
            });
          }
          const cursor =
            query.cursor === undefined
              ? undefined
              : yield* decodeCursor(query.cursor).pipe(
                  Option.match({
                    onNone: () =>
                      Effect.fail(
                        new InvalidCursor({ message: "Start again from the first page" }),
                      ),
                    onSome: Effect.succeed,
                  }),
                );
          const limit = query.limit ?? SESSIONS_PAGE_DEFAULT;
          const at = (yield* now).toISOString();

          // `mine` lists sessions still going on (not yet ended) first, then past ones.
          const upcoming =
            query.scope === "mine"
              ? sql`${playSession.startsAt} + make_interval(mins => ${playSession.durationMinutes}::int) > ${at}::timestamptz`
              : sql`true`;
          const bucket = sql<number>`(case when ${upcoming} then 0 else 1 end)`.mapWith(Number);
          const epochMs = sql`(extract(epoch from ${playSession.startsAt}) * 1000)::float8`;
          const key =
            sql<number>`(case when ${upcoming} then ${epochMs} else -${epochMs} end)`.mapWith(
              Number,
            );

          const scopeConditions: Array<SQL | undefined> =
            query.scope === "mine"
              ? [
                  inArray(mine.state, ["invited", "requested", "accepted"]),
                  notBlocked(viewer.id, playSession.hostId),
                ]
              : [
                  ...canSee(viewer, me?.ntrp),
                  ne(playSession.hostId, viewer.id),
                  eq(playSession.visibility, "open"),
                  eq(playSession.status, "open"),
                  sql`${playSession.startsAt} > ${at}::timestamptz`,
                  sql`${acceptedCount} < ${playSession.spots}`,
                  levelIncludes(me?.ntrp),
                  sql`ST_DWithin(${sessionPoint}::geography, ${geographyOf(me!.homePoint!)}, ${me!.searchRadiusKm * 1000})`,
                ];

          const rows = yield* summarySelect(viewer, me?.homePoint)
            .where(
              and(
                ...scopeConditions,
                cursor &&
                  sql`(${bucket}, ${key}, ${playSession.id}) > (${cursor.bucket}::int, ${cursor.key}::float8, ${cursor.id}::uuid)`,
              ),
            )
            .orderBy(asc(bucket), asc(key), asc(playSession.id))
            .limit(limit + 1)
            .pipe(Effect.orDie);
          // The ordering keys aren't columns on the row, so work them out again in JS.
          const nowMs = new Date(at).getTime();
          const keyOf = (row: Row) => {
            const startMs = row.startsAt.getTime();
            const past = query.scope === "mine" && startMs + row.durationMinutes * 60_000 <= nowMs;
            return past
              ? { bucket: 1 as const, key: -startMs, id: row.id }
              : { bucket: 0 as const, key: startMs, id: row.id };
          };

          const page = rows.slice(0, limit);
          const last = page.at(-1);
          return new SessionsPage({
            items: page.map((row) => new SessionSummary(toFields(row))),
            nextCursor: rows.length > limit && last ? encodeCursor(keyOf(last)) : null,
          });
        }).pipe(Effect.withSpan("Sessions.list"));

      return Sessions.of({ create, get, update, list, invite });
    }),
  );
}
