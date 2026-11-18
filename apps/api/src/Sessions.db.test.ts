import {
  type NewSession,
  type ProfilePatch,
  SessionUser,
  type SessionsPage,
  type SessionsQuery,
} from "@love-all/domain";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer, type Types } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { playSession, playSessionParticipant, user } from "./db/schema";
import { Profiles } from "./Profiles";
import { Forum } from "./Forum";
import { Safety } from "./Safety";
import { Sessions } from "./Sessions";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

/**
 * Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set.
 *
 * Players and courts are near Tromsø, Norway, away from the points other test
 * files use, so parallel test files never show up in each other's lists.
 */
const sent = makeNotificationsMemory();
const TestLayer = Layer.mergeAll(
  Sessions.layer,
  Profiles.layer,
  Safety.layer.pipe(Layer.provide(Forum.layer)),
).pipe(Layer.provide(sent.layer), Layer.provideMerge(Db.layer));

const HOME = { lat: 69.65, lng: 18.96 };
/** About 1.1 km per 0.01 degrees of latitude. */
const north = (hundredths: number) => ({ lat: HOME.lat + hundredths / 100, lng: HOME.lng });

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

const singles = (overrides: Partial<NewSession> = {}): NewSession => ({
  kind: "singles",
  startsAt: inDays(2),
  durationMinutes: 90,
  courtName: "Tromsø tennis club, court 2",
  courtPoint: HOME,
  visibility: "open",
  ...overrides,
});

type Services = {
  db: Db["Service"];
  sessions: Sessions["Service"];
  profiles: Profiles["Service"];
  safety: Safety["Service"];
};

/**
 * Creates throwaway players with the given profiles (null for none), runs
 * `f`, then deletes them, which deletes their sessions too.
 */
const withPlayers = <A, E>(
  patches: ReadonlyArray<ProfilePatch | null>,
  f: (players: ReadonlyArray<SessionUser>, services: Services) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const services = {
      db,
      sessions: yield* Sessions,
      profiles: yield* Profiles,
      safety: yield* Safety,
    };
    const players = patches.map((_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    return yield* Effect.gen(function* () {
      for (const [i, patch] of patches.entries()) {
        if (patch) {
          yield* services.profiles.update(players[i]!, patch);
        }
      }
      return yield* f(players, services);
    }).pipe(
      Effect.ensuring(
        Effect.orDie(
          db.delete(user).where(
            inArray(
              user.id,
              players.map((p) => p.id),
            ),
          ),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const player = (ntrp: ProfilePatch["ntrp"] = "3.5", homePoint = HOME): ProfilePatch => ({
  homePoint,
  ntrp,
});

describe.skipIf(!process.env.DATABASE_URL)("Sessions.create", () => {
  it("creates a session with the host as its first accepted player", async () => {
    const session = await withPlayers([player()], ([host], { sessions }) =>
      sessions.create(host!, singles({ levelMin: "3.0", levelMax: "4.0", notes: "Bring balls" })),
    );
    expect(session).toMatchObject({
      kind: "singles",
      spots: 2,
      acceptedCount: 1,
      status: "open",
      visibility: "open",
      levelMin: "3.0",
      levelMax: "4.0",
      notes: "Bring balls",
      courtPoint: HOME,
      me: { role: "host", state: "accepted" },
      distanceKm: 1,
    });
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0]).toMatchObject({ role: "host", state: "accepted" });
    expect(session.host?.displayName).toBe("P0");
  });

  it("derives spots from the kind, and lets hitting pick 2 to 4", async () => {
    const spots = await withPlayers([player()], ([host], { sessions }) =>
      Effect.all([
        sessions.create(host!, singles({ kind: "doubles" })),
        sessions.create(host!, singles({ kind: "hitting" })),
        sessions.create(host!, singles({ kind: "hitting", spots: 3 })),
      ]).pipe(Effect.map((all) => all.map((s) => s.spots))),
    );
    expect(spots).toEqual([4, 2, 3]);
  });

  it("refuses a start in the past and a host with no profile", async () => {
    const errors = await withPlayers([player(), null], ([host, noProfile], { sessions }) =>
      Effect.all([
        Effect.flip(sessions.create(host!, singles({ startsAt: inDays(-1) }))),
        Effect.flip(sessions.create(noProfile!, singles())),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["InvalidSession", "ProfileRequired"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Sessions.update", () => {
  it("lets the host change time, court, levels and notes", async () => {
    const updated = await withPlayers([player()], ([host], { sessions }) =>
      Effect.gen(function* () {
        const session = yield* sessions.create(host!, singles());
        return yield* sessions.update(host!, session.id, {
          startsAt: inDays(3),
          courtName: "Indoor hall",
          courtPoint: null,
          levelMin: "3.5",
          notes: null,
        });
      }),
    );
    expect(updated).toMatchObject({
      courtName: "Indoor hall",
      courtPoint: null,
      levelMin: "3.5",
      levelMax: null,
      notes: null,
    });
    // With no pin, the distance comes from the host's home point.
    expect(updated.distanceKm).toBe(1);
  });

  it("sends a new reminder when the start time moves", async () => {
    const after = await withPlayers([player()], ([host], { db, sessions }) =>
      Effect.gen(function* () {
        const session = yield* sessions.create(host!, singles());
        const sentAt = new Date();
        yield* db
          .update(playSession)
          .set({ reminderSentAt: sentAt })
          .where(eq(playSession.id, session.id));
        const reminded = () =>
          db
            .select({ at: playSession.reminderSentAt })
            .from(playSession)
            .where(eq(playSession.id, session.id))
            .pipe(Effect.map(([row]) => row?.at ?? null));
        yield* sessions.update(host!, session.id, { notes: "Bring balls" });
        const notesOnly = yield* reminded();
        yield* sessions.update(host!, session.id, { startsAt: inDays(3) });
        return { notesOnly, moved: yield* reminded() };
      }),
    );
    expect(after.notesOnly).not.toBeNull();
    expect(after.moved).toBeNull();
  });

  it("is host only, and hides sessions the player can't see", async () => {
    const errors = await withPlayers(
      [player(), player(), player()],
      ([host, other, blocked], { sessions, safety }) =>
        Effect.gen(function* () {
          const open = yield* sessions.create(host!, singles());
          const privateOne = yield* sessions.create(host!, singles({ visibility: "invite_only" }));
          yield* safety.block(host!, blocked!.id);
          return yield* Effect.all([
            Effect.flip(sessions.update(other!, open.id, { notes: "Mine now" })),
            Effect.flip(sessions.update(other!, privateOne.id, { notes: "Mine now" })),
            Effect.flip(sessions.update(blocked!, open.id, { notes: "Mine now" })),
          ]);
        }),
    );
    expect(errors.map((e) => e._tag)).toEqual([
      "NotSessionHost",
      "SessionNotFound",
      "SessionNotFound",
    ]);
  });

  it("keeps spots legal for the kind and above the accepted players", async () => {
    const result = await withPlayers(
      [player(), player(), player()],
      ([host, a, b], { db, sessions }) =>
        Effect.gen(function* () {
          const match = yield* sessions.create(host!, singles());
          const hit = yield* sessions.create(host!, singles({ kind: "hitting", spots: 4 }));
          yield* db.insert(playSessionParticipant).values([
            { sessionId: hit.id, userId: a!.id, state: "accepted" },
            { sessionId: hit.id, userId: b!.id, state: "accepted" },
          ]);
          const errors = yield* Effect.all([
            Effect.flip(sessions.update(host!, match.id, { spots: 3 })),
            Effect.flip(sessions.update(host!, hit.id, { spots: 2 })),
            Effect.flip(sessions.update(host!, match.id, { levelMin: "4.0", levelMax: "3.0" })),
            Effect.flip(sessions.update(host!, match.id, { startsAt: inDays(-1) })),
          ]);
          const filled = yield* sessions.update(host!, hit.id, { spots: 3 });
          return { errors: errors.map((e) => e._tag), filled };
        }),
    );
    expect(result.errors).toEqual([
      "InvalidSession",
      "InvalidSession",
      "InvalidSession",
      "InvalidSession",
    ]);
    // Three accepted players fill three spots.
    expect(result.filled).toMatchObject({ spots: 3, acceptedCount: 3, status: "confirmed" });
  });

  it("refuses changes to cancelled or started sessions", async () => {
    const errors = await withPlayers([player()], ([host], { db, sessions }) =>
      Effect.gen(function* () {
        const cancelled = yield* sessions.create(host!, singles());
        const started = yield* sessions.create(host!, singles());
        yield* db
          .update(playSession)
          .set({ status: "cancelled" })
          .where(eq(playSession.id, cancelled.id));
        yield* db
          .update(playSession)
          .set({ startsAt: inDays(-0.01) })
          .where(eq(playSession.id, started.id));
        return yield* Effect.all([
          Effect.flip(sessions.update(host!, cancelled.id, { notes: "x" })),
          Effect.flip(sessions.update(host!, started.id, { notes: "x" })),
        ]);
      }),
    );
    expect(errors.map((e) => e._tag)).toEqual(["SessionClosed", "SessionClosed"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Sessions.get", () => {
  it("shows an open session to players in its level range only", async () => {
    const result = await withPlayers(
      [player("4.0"), player("4.0"), player("3.0"), player(null)],
      ([host, inRange, below, unrated], { sessions }) =>
        Effect.gen(function* () {
          const session = yield* sessions.create(
            host!,
            singles({ levelMin: "3.5", levelMax: "4.5" }),
          );
          const anyLevel = yield* sessions.create(host!, singles());
          return {
            inRange: yield* sessions.get(inRange!, session.id),
            below: yield* Effect.flip(sessions.get(below!, session.id)),
            unrated: yield* Effect.flip(sessions.get(unrated!, session.id)),
            unratedAny: yield* sessions.get(unrated!, anyLevel.id),
          };
        }),
    );
    expect(result.inRange.me).toBeNull();
    expect(result.below._tag).toBe("SessionNotFound");
    expect(result.unrated._tag).toBe("SessionNotFound");
    expect(result.unratedAny.id).toBeDefined();
  });

  it("shows the host every participant, and others only accepted and invited ones", async () => {
    const result = await withPlayers(
      [player(), player(), player(), player()],
      ([host, invited, requester, viewer], { db, sessions }) =>
        Effect.gen(function* () {
          const session = yield* sessions.create(host!, singles());
          yield* sessions.invite(host!, session.id, { playerIds: [invited!.id] });
          yield* db
            .insert(playSessionParticipant)
            .values({ sessionId: session.id, userId: requester!.id, state: "requested" });
          return {
            host: yield* sessions.get(host!, session.id),
            viewer: yield* sessions.get(viewer!, session.id),
            requester: yield* sessions.get(requester!, session.id),
          };
        }),
    );
    expect(result.host.participants.map((p) => p.state)).toEqual([
      "accepted",
      "invited",
      "requested",
    ]);
    expect(result.viewer.participants.map((p) => p.state)).toEqual(["accepted", "invited"]);
    expect(result.requester.participants.map((p) => p.state)).toEqual([
      "accepted",
      "invited",
      "requested",
    ]);
    expect(result.requester.me).toEqual({ role: "player", state: "requested" });
    expect(result.host.requestCount).toBe(1);
    expect(result.viewer.requestCount).toBe(0);
    expect(result.requester.requestCount).toBe(0);
  });

  it("hides participants blocked with the viewer", async () => {
    const result = await withPlayers(
      [player(), player(), player()],
      ([host, invited, viewer], { safety, sessions }) =>
        Effect.gen(function* () {
          const session = yield* sessions.create(host!, singles());
          yield* sessions.invite(host!, session.id, { playerIds: [invited!.id] });
          yield* safety.block(viewer!, invited!.id);
          return yield* sessions.get(viewer!, session.id);
        }),
    );
    expect(result.participants.map((p) => p.role)).toEqual(["host"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Sessions.list", () => {
  it("finds nearby open sessions in range, with spots left, not past or blocked", async () => {
    const result = await withPlayers(
      [player("3.5"), player("3.5"), player("3.5"), player("3.5", north(40)), player("3.5")],
      ([me, host, blockedHost, farHost, filler], { db, safety, sessions }) =>
        Effect.gen(function* () {
          const near = yield* sessions.create(host!, singles({ courtPoint: north(5) }));
          // No pin: located at the host's home point.
          const unpinned = yield* sessions.create(
            host!,
            singles({ courtPoint: null, startsAt: inDays(3) }),
          );
          yield* sessions.create(host!, singles({ courtPoint: north(30) }));
          yield* sessions.create(farHost!, singles({ courtPoint: null }));
          yield* sessions.create(host!, singles({ levelMin: "4.0" }));
          yield* sessions.create(host!, singles({ visibility: "invite_only" }));
          const full = yield* sessions.create(host!, singles());
          yield* db
            .insert(playSessionParticipant)
            .values({ sessionId: full.id, userId: filler!.id, state: "accepted" });
          const past = yield* sessions.create(host!, singles());
          yield* db
            .update(playSession)
            .set({ startsAt: inDays(-1) })
            .where(eq(playSession.id, past.id));
          yield* sessions.create(blockedHost!, singles());
          yield* safety.block(blockedHost!, me!.id);
          yield* sessions.create(me!, singles());
          const page = yield* sessions.list(me!, { scope: "nearby" });
          return { page, ids: { near: near.id, unpinned: unpinned.id } };
        }),
    );
    expect(result.page.items.map((s) => s.id)).toEqual([result.ids.near, result.ids.unpinned]);
    expect(result.page.items[0]!.distanceKm).toBe(6);
    expect(result.page.items[0]!.me).toBeNull();
    expect(result.page.nextCursor).toBeNull();
  });

  it("lists my sessions, upcoming soonest first, then past latest first", async () => {
    const result = await withPlayers(
      [player(), player(), player()],
      ([me, host, blockedHost], { db, safety, sessions }) =>
        Effect.gen(function* () {
          const later = yield* sessions.create(me!, singles({ startsAt: inDays(5) }));
          const invited = yield* sessions.create(
            host!,
            singles({ startsAt: inDays(1), visibility: "invite_only" }),
          );
          yield* sessions.invite(host!, invited.id, { playerIds: [me!.id] });
          const lastWeek = yield* sessions.create(me!, singles());
          const yesterday = yield* sessions.create(me!, singles());
          yield* db
            .update(playSession)
            .set({ startsAt: inDays(-7) })
            .where(eq(playSession.id, lastWeek.id));
          yield* db
            .update(playSession)
            .set({ startsAt: inDays(-1) })
            .where(eq(playSession.id, yesterday.id));
          // Not mine: an open session I'm not in, and one I was invited to by a player who then blocked me.
          yield* sessions.create(host!, singles());
          const blockedInvite = yield* sessions.create(blockedHost!, singles());
          yield* sessions.invite(blockedHost!, blockedInvite.id, { playerIds: [me!.id] });
          yield* safety.block(blockedHost!, me!.id);

          const first = yield* sessions.list(me!, { scope: "mine", limit: 3 });
          const second = yield* sessions.list(me!, {
            scope: "mine",
            limit: 3,
            cursor: first.nextCursor!,
          });
          return {
            first,
            second,
            expected: [invited.id, later.id, yesterday.id, lastWeek.id],
          };
        }),
    );
    expect([...result.first.items, ...result.second.items].map((s) => s.id)).toEqual(
      result.expected,
    );
    expect(result.first.items[0]!.me).toEqual({ role: "player", state: "invited" });
    expect(result.second.nextCursor).toBeNull();
  });

  it("pages nearby sessions that start at the same time", async () => {
    const result = await withPlayers([player(), player()], ([me, host], { sessions }) =>
      Effect.gen(function* () {
        const startsAt = inDays(2);
        for (let i = 0; i < 5; i++) {
          yield* sessions.create(host!, singles({ startsAt }));
        }
        const seen: Array<string> = [];
        let cursor: string | null = null;
        do {
          const query: Types.Mutable<SessionsQuery> = { scope: "nearby", limit: 2 };
          if (cursor) {
            query.cursor = cursor;
          }
          const page: SessionsPage = yield* sessions.list(me!, query);
          seen.push(...page.items.map((s) => s.id));
          cursor = page.nextCursor;
        } while (cursor);
        return seen;
      }),
    );
    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(5);
  });

  it("needs a home point for nearby, and rejects a made-up cursor", async () => {
    const errors = await withPlayers([{ ntrp: "3.5" }], ([me], { sessions }) =>
      Effect.all([
        Effect.flip(sessions.list(me!, { scope: "nearby" })),
        Effect.flip(sessions.list(me!, { scope: "mine", cursor: "bm9wZQ" })),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["HomePointRequired", "InvalidCursor"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Sessions.invite", () => {
  it("invites players once each, and they see it in mine", async () => {
    const result = await withPlayers([player(), player()], ([host, guest], { sessions }) =>
      Effect.gen(function* () {
        const session = yield* sessions.create(host!, singles({ visibility: "invite_only" }));
        yield* sessions.invite(host!, session.id, { playerIds: [guest!.id, guest!.id] });
        const again = yield* sessions.invite(host!, session.id, { playerIds: [guest!.id] });
        return { again, mine: yield* sessions.list(guest!, { scope: "mine" }) };
      }),
    );
    expect(result.again.participants.map((p) => p.state)).toEqual(["accepted", "invited"]);
    expect(result.mine.items).toHaveLength(1);
  });

  it("notifies each newly invited player once", async () => {
    await withPlayers([player(), player(), player()], ([host, a, b], { sessions }) =>
      Effect.gen(function* () {
        const session = yield* sessions.create(host!, singles({ kind: "hitting", spots: 3 }));
        yield* sessions.invite(host!, session.id, { playerIds: [a!.id] });
        yield* sessions.invite(host!, session.id, { playerIds: [a!.id, b!.id] });
        expect(
          sent.about(`/sessions/${session.id}`).map((n) => ({ to: n.to, from: n.from })),
        ).toEqual([
          { to: [a!.id], from: host!.id },
          { to: [b!.id], from: host!.id },
        ]);
      }),
    );
  });

  it("rejects blocked or unknown players, myself, non-hosts and full sessions", async () => {
    const errors = await withPlayers(
      [player(), player(), player(), player()],
      ([host, blocked, guest, other], { db, safety, sessions }) =>
        Effect.gen(function* () {
          const session = yield* sessions.create(host!, singles());
          yield* safety.block(blocked!, host!.id);
          const blockedError = yield* Effect.flip(
            sessions.invite(host!, session.id, { playerIds: [guest!.id, blocked!.id] }),
          );
          const unknown = yield* Effect.flip(
            sessions.invite(host!, session.id, { playerIds: ["nobody"] }),
          );
          const self = yield* Effect.flip(
            sessions.invite(host!, session.id, { playerIds: [host!.id] }),
          );
          const notHost = yield* Effect.flip(
            sessions.invite(other!, session.id, { playerIds: [guest!.id] }),
          );
          yield* db
            .insert(playSessionParticipant)
            .values({ sessionId: session.id, userId: guest!.id, state: "accepted" });
          const full = yield* Effect.flip(
            sessions.invite(host!, session.id, { playerIds: [other!.id] }),
          );
          // Nothing was written by the failed calls.
          const rows = yield* db
            .select({ userId: playSessionParticipant.userId })
            .from(playSessionParticipant)
            .where(eq(playSessionParticipant.sessionId, session.id));
          return { tags: [blockedError, unknown, self, notHost, full].map((e) => e._tag), rows };
        }),
    );
    expect(errors.tags).toEqual([
      "PlayerNotFound",
      "PlayerNotFound",
      "InvalidSession",
      "NotSessionHost",
      "SessionFull",
    ]);
    expect(errors.rows).toHaveLength(2);
  });
});
