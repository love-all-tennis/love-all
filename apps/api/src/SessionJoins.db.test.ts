import { type Ntrp, SessionUser } from "@love-all/domain";
import { and, eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { block, playSession, playSessionParticipant, profile, user } from "./db/schema";
import { Forum } from "./Forum";
import { Safety } from "./Safety";
import { SessionJoins } from "./SessionJoins";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

/** Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set. */
const sent = makeNotificationsMemory();
const TestLayer = Layer.mergeAll(
  SessionJoins.layer,
  Safety.layer.pipe(Layer.provide(Forum.layer)),
).pipe(Layer.provide(sent.layer), Layer.provideMerge(Db.layer));

type Services = { db: Db["Service"]; joins: SessionJoins["Service"]; safety: Safety["Service"] };

/**
 * Creates throwaway accounts with profiles at the given NTRP levels (null for
 * none), runs `f` with them, then deletes them and their sessions.
 */
const withPlayers = <A, E>(
  levels: ReadonlyArray<Ntrp | null>,
  f: (players: ReadonlyArray<SessionUser>, services: Services) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const services = { db, joins: yield* SessionJoins, safety: yield* Safety };
    const players = levels.map((_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    yield* db
      .insert(profile)
      .values(players.map((p, i) => ({ userId: p.id, displayName: p.name, ntrp: levels[i] })));
    return yield* f(players, services).pipe(
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

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

/** Inserts a session hosted by `host`, plus the host's own accepted row and any invites. */
const makeSession = (
  db: Db["Service"],
  host: SessionUser,
  options: {
    kind?: "singles" | "doubles" | "hitting";
    visibility?: "open" | "invite_only";
    startsAt?: Date;
    levelMin?: Ntrp;
    levelMax?: Ntrp;
    invited?: ReadonlyArray<SessionUser>;
    accepted?: ReadonlyArray<SessionUser>;
  } = {},
) =>
  Effect.gen(function* () {
    const kind = options.kind ?? "singles";
    const [row] = yield* db
      .insert(playSession)
      .values({
        hostId: host.id,
        kind,
        startsAt: options.startsAt ?? tomorrow(),
        durationMinutes: 90,
        courtName: "Palmer Park",
        spots: kind === "doubles" ? 4 : 2,
        visibility: options.visibility ?? "open",
        levelMin: options.levelMin ?? null,
        levelMax: options.levelMax ?? null,
      })
      .returning({ id: playSession.id });
    const id = row!.id;
    yield* db.insert(playSessionParticipant).values([
      { sessionId: id, userId: host.id, role: "host", state: "accepted" },
      ...(options.invited ?? []).map((p) => ({
        sessionId: id,
        userId: p.id,
        state: "invited" as const,
      })),
      ...(options.accepted ?? []).map((p) => ({
        sessionId: id,
        userId: p.id,
        state: "accepted" as const,
      })),
    ]);
    return id;
  });

/** The session's status and each player's state, by display name. */
const snapshot = (db: Db["Service"], sessionId: string) =>
  Effect.gen(function* () {
    const [session] = yield* db
      .select({ status: playSession.status })
      .from(playSession)
      .where(eq(playSession.id, sessionId));
    const rows = yield* db
      .select({ name: user.name, state: playSessionParticipant.state })
      .from(playSessionParticipant)
      .innerJoin(user, eq(user.id, playSessionParticipant.userId))
      .where(eq(playSessionParticipant.sessionId, sessionId));
    return {
      status: session?.status,
      states: Object.fromEntries(rows.map((r) => [r.name, r.state])),
    };
  });

const tagOf = <A, E extends { _tag: string }>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((e) => e._tag),
  );

/** Notices about the session, with players named instead of ids. */
const heard = (id: string, players: ReadonlyArray<SessionUser>) =>
  sent.about(`/sessions/${id}`).map((notice) => ({
    to: notice.to.map((to) => players.find((p) => p.id === to)?.name ?? to).sort(),
    title: notice.title,
  }));

describe.skipIf(!process.env.DATABASE_URL)("SessionJoins", () => {
  it("confirms a singles session when the invited player accepts", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, guest], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, { invited: [guest!] });
        yield* joins.respond(guest!, id, "accept");
        yield* joins.respond(guest!, id, "accept");
        return yield* snapshot(db, id);
      }),
    );
    expect(result).toEqual({ status: "confirmed", states: { P0: "accepted", P1: "accepted" } });
  });

  it("declines an invite, and refuses accepting without one", async () => {
    const result = await withPlayers(["3.5", "3.5", "3.5"], ([host, guest, other], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, { invited: [guest!] });
        yield* joins.respond(guest!, id, "decline");
        const acceptAfter = yield* tagOf(joins.respond(guest!, id, "accept"));
        const noInvite = yield* tagOf(joins.respond(other!, id, "accept"));
        const declineNone = yield* tagOf(joins.respond(other!, id, "decline"));
        return { acceptAfter, noInvite, declineNone, ...(yield* snapshot(db, id)) };
      }),
    );
    expect(result).toMatchObject({
      acceptAfter: "NotInvited",
      noInvite: "NotInvited",
      declineNone: "NotInvited",
      status: "open",
      states: { P1: "declined" },
    });
  });

  it("asks to join an open session; the host approves until full, which declines the rest", async () => {
    const result = await withPlayers(
      ["4.0", "4.0", "4.0", "4.0", "4.0"],
      ([host, a, b, c, d], { db, joins }) =>
        Effect.gen(function* () {
          const id = yield* makeSession(db, host!, { kind: "doubles", accepted: [a!] });
          yield* joins.respond(b!, id, "request");
          yield* joins.respond(c!, id, "request");
          yield* joins.respond(d!, id, "request");
          const pending = yield* snapshot(db, id);
          yield* joins.approve(host!, id, b!.id);
          yield* joins.approve(host!, id, c!.id);
          const approveLate = yield* tagOf(joins.approve(host!, id, d!.id));
          const requestLate = yield* tagOf(joins.respond(d!, id, "request"));
          return { pending, approveLate, requestLate, after: yield* snapshot(db, id) };
        }),
    );
    expect(result.pending.states).toMatchObject({ P2: "requested", P3: "requested" });
    expect(result.approveLate).toBe("JoinRequestNotFound");
    expect(result.requestLate).toBe("NotInvited");
    expect(result.after).toEqual({
      status: "confirmed",
      states: { P0: "accepted", P1: "accepted", P2: "accepted", P3: "accepted", P4: "declined" },
    });
  });

  it("accepts an invite when the invited player asks to join", async () => {
    const result = await withPlayers(["3.0", "5.0"], ([host, guest], { db, joins }) =>
      Effect.gen(function* () {
        // The host picked them, so the level range doesn't apply.
        const id = yield* makeSession(db, host!, { invited: [guest!], levelMax: "3.5" });
        yield* joins.respond(guest!, id, "request");
        return yield* snapshot(db, id);
      }),
    );
    expect(result.states.P1).toBe("accepted");
  });

  it("lets the host reject a request, and the player can't ask again", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, guest], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!);
        yield* joins.respond(guest!, id, "request");
        const notHost = yield* tagOf(joins.reject(guest!, id, guest!.id));
        yield* joins.reject(host!, id, guest!.id);
        const again = yield* tagOf(joins.respond(guest!, id, "request"));
        return { notHost, again, ...(yield* snapshot(db, id)) };
      }),
    );
    expect(result).toMatchObject({
      notHost: "NotSessionHost",
      again: "NotInvited",
      status: "open",
      states: { P1: "declined" },
    });
  });

  it("checks the level range for requests", async () => {
    const result = await withPlayers(
      ["3.5", "3.0", "4.5", null, "4.0"],
      ([host, low, high, none, fits], { db, joins }) =>
        Effect.gen(function* () {
          const id = yield* makeSession(db, host!, {
            kind: "doubles",
            levelMin: "3.5",
            levelMax: "4.0",
          });
          const strangers = {
            // Out of range, the session is hidden from them, as in GET /sessions/:id.
            low: yield* tagOf(joins.respond(low!, id, "request")),
            high: yield* tagOf(joins.respond(high!, id, "request")),
            none: yield* tagOf(joins.respond(none!, id, "request")),
            fits: yield* joins.respond(fits!, id, "request").pipe(Effect.as("ok")),
          };
          // A player who left can still see it, but can't ask again once out of range.
          yield* joins.leave(fits!, id);
          yield* db.update(playSession).set({ levelMax: "3.5" }).where(eq(playSession.id, id));
          const narrowed = yield* tagOf(joins.respond(fits!, id, "request"));
          return { ...strangers, narrowed };
        }),
    );
    expect(result).toEqual({
      low: "SessionNotFound",
      high: "SessionNotFound",
      none: "SessionNotFound",
      fits: "ok",
      narrowed: "LevelOutOfRange",
    });
  });

  it("hides cancelled sessions from players who aren't in them", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, stranger], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!);
        yield* joins.cancel(host!, id);
        return yield* tagOf(joins.respond(stranger!, id, "request"));
      }),
    );
    expect(result).toBe("SessionNotFound");
  });

  it("hides invite-only sessions from players with no invite", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, stranger], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, { visibility: "invite_only" });
        return {
          request: yield* tagOf(joins.respond(stranger!, id, "request")),
          leave: yield* tagOf(joins.leave(stranger!, id)),
          missing: yield* tagOf(joins.respond(stranger!, crypto.randomUUID(), "request")),
        };
      }),
    );
    expect(result).toEqual({
      request: "SessionNotFound",
      leave: "SessionNotFound",
      missing: "SessionNotFound",
    });
  });

  it("gives the last spot to only one of two players accepting at once", async () => {
    const result = await withPlayers(
      ["3.5", "3.5", "3.5", "3.5", "3.5"],
      ([host, a, b, c, d], { db, joins }) =>
        Effect.gen(function* () {
          const id = yield* makeSession(db, host!, {
            kind: "doubles",
            accepted: [a!, b!],
            invited: [c!, d!],
          });
          const outcomes = yield* Effect.all(
            [c!, d!].map((p) =>
              joins.respond(p, id, "accept").pipe(
                Effect.as("ok"),
                Effect.catch((error) => Effect.succeed(error._tag)),
              ),
            ),
            { concurrency: "unbounded" },
          );
          return { outcomes, after: yield* snapshot(db, id) };
        }),
    );
    expect([...result.outcomes].sort()).toEqual(["SessionFull", "ok"]);
    expect(result.after.status).toBe("confirmed");
    expect(Object.values(result.after.states).filter((s) => s === "accepted")).toHaveLength(4);
  });

  it("goes back to open when a player leaves a confirmed session", async () => {
    const result = await withPlayers(["3.5", "3.5", "3.5"], ([host, guest, other], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, { invited: [guest!] });
        yield* joins.respond(guest!, id, "accept");
        const confirmed = (yield* snapshot(db, id)).status;
        yield* joins.leave(guest!, id);
        const hostLeaves = yield* tagOf(joins.leave(host!, id));
        const notIn = yield* tagOf(joins.leave(other!, id));
        const leaveTwice = yield* tagOf(joins.leave(guest!, id));
        return { confirmed, hostLeaves, notIn, leaveTwice, after: yield* snapshot(db, id) };
      }),
    );
    expect(result).toEqual({
      confirmed: "confirmed",
      hostLeaves: "InvalidSession",
      notIn: "NotInvited",
      leaveTwice: "NotInvited",
      after: { status: "open", states: { P0: "accepted", P1: "left" } },
    });
  });

  it("withdraws a request by leaving, and can ask again after", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, guest], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!);
        yield* joins.respond(guest!, id, "request");
        yield* joins.leave(guest!, id);
        const left = (yield* snapshot(db, id)).states.P1;
        yield* joins.respond(guest!, id, "request");
        return { left, again: (yield* snapshot(db, id)).states.P1 };
      }),
    );
    expect(result).toEqual({ left: "left", again: "requested" });
  });

  it("cancels for the host only, and takes no answers after", async () => {
    const result = await withPlayers(["3.5", "3.5"], ([host, guest], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, { invited: [guest!] });
        const notHost = yield* tagOf(joins.cancel(guest!, id));
        yield* joins.cancel(host!, id);
        yield* joins.cancel(host!, id);
        return {
          notHost,
          accept: yield* tagOf(joins.respond(guest!, id, "accept")),
          leave: yield* tagOf(joins.leave(guest!, id)),
          status: (yield* snapshot(db, id)).status,
        };
      }),
    );
    expect(result).toEqual({
      notHost: "NotSessionHost",
      accept: "SessionClosed",
      leave: "SessionClosed",
      status: "cancelled",
    });
  });

  it("takes no answers once a session has started", async () => {
    const result = await withPlayers(["3.5", "3.5", "3.5"], ([host, guest, other], { db, joins }) =>
      Effect.gen(function* () {
        const id = yield* makeSession(db, host!, {
          invited: [guest!],
          startsAt: new Date(Date.now() - 60_000),
        });
        return {
          accept: yield* tagOf(joins.respond(guest!, id, "accept")),
          request: yield* tagOf(joins.respond(other!, id, "request")),
          cancel: yield* tagOf(joins.cancel(host!, id)),
        };
      }),
    );
    expect(result).toEqual({
      accept: "SessionClosed",
      request: "SessionClosed",
      cancel: "SessionClosed",
    });
  });

  it("hides a blocked host's session and won't approve a blocked player", async () => {
    const result = await withPlayers(
      ["3.5", "3.5", "3.5"],
      ([host, blocker, blocked], { db, joins }) =>
        Effect.gen(function* () {
          const id = yield* makeSession(db, host!, { kind: "doubles" });
          yield* db.insert(block).values({ blockerId: blocker!.id, blockedId: host!.id });
          const request = yield* tagOf(joins.respond(blocker!, id, "request"));
          // A request already in when the block lands (Safety.block also removes it).
          yield* joins.respond(blocked!, id, "request");
          yield* db.insert(block).values({ blockerId: host!.id, blockedId: blocked!.id });
          const approve = yield* tagOf(joins.approve(host!, id, blocked!.id));
          return { request, approve };
        }),
    );
    expect(result).toEqual({ request: "SessionNotFound", approve: "JoinRequestNotFound" });
  });

  it("takes a newly blocked player out of the host's sessions, reopening a confirmed one", async () => {
    const result = await withPlayers(["3.5", "3.5", "3.5"], ([host, guest, bystander], services) =>
      Effect.gen(function* () {
        const { db, safety } = services;
        const hosted = yield* makeSession(db, host!, { accepted: [guest!] });
        yield* db
          .update(playSession)
          .set({ status: "confirmed" })
          .where(eq(playSession.id, hosted));
        // A session the blocked player hosts loses the blocker too.
        const theirs = yield* makeSession(db, guest!, { kind: "doubles", invited: [host!] });
        const unrelated = yield* makeSession(db, bystander!, {
          kind: "doubles",
          accepted: [guest!],
        });
        yield* safety.block(host!, guest!.id);
        const [unrelatedGuest] = yield* db
          .select({ state: playSessionParticipant.state })
          .from(playSessionParticipant)
          .where(
            and(
              eq(playSessionParticipant.sessionId, unrelated),
              eq(playSessionParticipant.userId, guest!.id),
            ),
          );
        return {
          hosted: yield* snapshot(db, hosted),
          theirs: yield* snapshot(db, theirs),
          unrelated: unrelatedGuest?.state,
        };
      }),
    );
    expect(result).toEqual({
      hosted: { status: "open", states: { P0: "accepted" } },
      theirs: { status: "open", states: { P1: "accepted" } },
      unrelated: "accepted",
    });
  });

  describe("notifications", () => {
    it("tells the host about answers to invites, and everyone when it fills", async () => {
      await withPlayers(["3.5", "3.5", "3.5", "3.5"], (players, { db, joins }) =>
        Effect.gen(function* () {
          const [host, a, b, c] = players;
          const id = yield* makeSession(db, host!, { kind: "doubles", invited: [a!, b!, c!] });
          yield* joins.respond(a!, id, "accept");
          yield* joins.respond(b!, id, "decline");
          expect(heard(id, players)).toEqual([
            { to: ["P0"], title: "P1 is in" },
            { to: ["P0"], title: "P2 can't make it" },
          ]);
        }),
      );
      await withPlayers(["3.5", "3.5"], (players, { db, joins }) =>
        Effect.gen(function* () {
          const [host, guest] = players;
          const id = yield* makeSession(db, host!, { invited: [guest!] });
          yield* joins.respond(guest!, id, "accept");
          // The guest filled the last spot, so only the host needs telling.
          expect(heard(id, players)).toEqual([{ to: ["P0"], title: "Session confirmed" }]);
        }),
      );
    });

    it("tells the host about requests, and the player about the answer", async () => {
      await withPlayers(["4.0", "4.0", "4.0", "4.0"], (players, { db, joins }) =>
        Effect.gen(function* () {
          const [host, a, b, c] = players;
          const id = yield* makeSession(db, host!, { kind: "doubles", accepted: [a!] });
          yield* joins.respond(b!, id, "request");
          yield* joins.respond(c!, id, "request");
          yield* joins.reject(host!, id, c!.id);
          yield* joins.approve(host!, id, b!.id);
          expect(heard(id, players)).toEqual([
            { to: ["P0"], title: "P2 asked to join" },
            { to: ["P0"], title: "P3 asked to join" },
            { to: ["P3"], title: "Request not approved" },
            { to: ["P2"], title: "You're in" },
          ]);
        }),
      );
    });

    it("tells the host when a player gives up a spot, but not when a request is withdrawn", async () => {
      await withPlayers(["4.0", "4.0", "4.0"], (players, { db, joins }) =>
        Effect.gen(function* () {
          const [host, a, b] = players;
          const id = yield* makeSession(db, host!, { kind: "doubles", accepted: [a!] });
          yield* joins.respond(b!, id, "request");
          yield* joins.leave(b!, id);
          yield* joins.leave(a!, id);
          expect(heard(id, players).slice(1)).toEqual([{ to: ["P0"], title: "P1 left" }]);
        }),
      );
    });

    it("tells every invited, waiting and accepted player when the host cancels", async () => {
      await withPlayers(["4.0", "4.0", "4.0", "4.0"], (players, { db, joins }) =>
        Effect.gen(function* () {
          const [host, a, b, c] = players;
          const id = yield* makeSession(db, host!, {
            kind: "doubles",
            accepted: [a!],
            invited: [b!],
          });
          yield* joins.respond(c!, id, "request");
          yield* joins.cancel(host!, id);
          yield* joins.cancel(host!, id);
          expect(heard(id, players).slice(1)).toEqual([
            { to: ["P1", "P2", "P3"], title: "Session cancelled" },
          ]);
        }),
      );
    });
  });
});
