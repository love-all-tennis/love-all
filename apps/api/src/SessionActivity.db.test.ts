import { type NewSessionResult, SessionUser } from "@love-all/domain";
import { inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { block, playSession, playSessionParticipant, profile, user } from "./db/schema";
import { SessionActivity } from "./SessionActivity";
import { Sessions } from "./Sessions";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const TestLayer = SessionActivity.layer.pipe(
  Layer.provideMerge(Sessions.layer),
  Layer.provide(makeNotificationsMemory().layer),
  Layer.provideMerge(Db.layer),
);

type Kind = "singles" | "doubles" | "hitting";

type State = "invited" | "requested" | "accepted" | "declined" | "left";

interface Setup {
  readonly kind?: Kind;
  readonly startsInHours?: number;
  readonly status?: "open" | "confirmed" | "cancelled";
  readonly visibility?: "open" | "invite_only";
  readonly states: ReadonlyArray<State | null>;
}

const withSession = <A, E>(
  setup: Setup,
  f: (
    players: ReadonlyArray<SessionUser>,
    sessionId: string,
    activity: SessionActivity["Service"],
    db: Db["Service"],
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const activity = yield* SessionActivity;

    const players = Array.from({ length: setup.states.length + 1 }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;

      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });

    const ids = players.map((p) => p.id);
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));

    return yield* Effect.gen(function* () {
      yield* db
        .insert(profile)
        .values(players.map((p, i) => ({ userId: p.id, displayName: `Player ${i}` })));
      const kind = setup.kind ?? "singles";

      const [session] = yield* db
        .insert(playSession)
        .values({
          hostId: players[0]!.id,
          kind,
          startsAt: new Date(Date.now() + (setup.startsInHours ?? -2) * 3_600_000),
          durationMinutes: 90,
          courtName: "Memorial Park, court 4",
          spots: kind === "doubles" ? 4 : 2,
          visibility: setup.visibility ?? "invite_only",
          status: setup.status ?? "confirmed",
        })
        .returning({ id: playSession.id });

      const rows = [
        {
          sessionId: session!.id,
          userId: players[0]!.id,
          role: "host" as const,
          state: "accepted" as const,
        },
        ...setup.states.flatMap((state, i) =>
          state ? [{ sessionId: session!.id, userId: players[i + 1]!.id, state }] : [],
        ),
      ];

      yield* db.insert(playSessionParticipant).values(rows);

      return yield* f(players, session!.id, activity, db);
    }).pipe(Effect.ensuring(Effect.orDie(db.delete(user).where(inArray(user.id, ids)))));
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const singles = (a: SessionUser, b: SessionUser) =>
  ({
    sideA: [a.id],
    sideB: [b.id],
    sets: [
      [6, 4],
      [3, 6],
      [10, 7],
    ],
  }) satisfies NewSessionResult;

describe.skipIf(!process.env.DATABASE_URL)("SessionActivity comments", () => {
  it("lets the host and accepted players post and read, oldest first, with paging", async () => {
    const result = await withSession({ states: ["accepted"] }, ([host, sam], id, activity) =>
      Effect.gen(function* () {
        yield* activity.addComment(host!, id, { body: "Court 4" });
        yield* activity.addComment(sam!, id, { body: "I'll bring balls" });
        yield* activity.addComment(host!, id, { body: "See you there" });
        const first = yield* activity.listComments(sam!, id, { limit: 2 });

        const second = yield* activity.listComments(sam!, id, {
          limit: 2,
          cursor: first.nextCursor!,
        });

        return { first, second };
      }),
    );

    expect(result.first.items.map((c) => c.body)).toEqual(["Court 4", "I'll bring balls"]);
    expect(result.first.items[1]!.author).toMatchObject({ displayName: "Player 1" });
    expect(result.first.nextCursor).toEqual(expect.any(String));
    expect(result.second.items.map((c) => c.body)).toEqual(["See you there"]);
    expect(result.second.nextCursor).toBeNull();
  });

  it("keeps invited, requested and left players and strangers out", async () => {
    const tags = await withSession(
      { states: ["invited", "requested", "left", null] },
      ([, invited, requested, left, stranger], id, activity) =>
        Effect.all([
          Effect.flip(activity.listComments(invited!, id, {})),
          Effect.flip(activity.addComment(requested!, id, { body: "hi" })),
          Effect.flip(activity.addComment(left!, id, { body: "hi" })),
          Effect.flip(activity.listComments(stranger!, id, {})),
        ]).pipe(Effect.map((errors) => errors.map((e) => e._tag))),
    );

    expect(tags).toEqual([
      "NotSessionPlayer",
      "NotSessionPlayer",
      "NotSessionPlayer",
      "SessionNotFound",
    ]);
  });

  it("tells a stranger to an open session they're not a player", async () => {
    const tag = await withSession(
      { states: [null], visibility: "open", status: "open" },
      ([, stranger], id, activity) =>
        Effect.flip(activity.listComments(stranger!, id, {})).pipe(Effect.map((e) => e._tag)),
    );

    expect(tag).toBe("NotSessionPlayer");
  });

  it("refuses new comments on a cancelled session and rejects a bad cursor", async () => {
    const tags = await withSession(
      { states: ["accepted"], status: "cancelled" },
      ([host], id, activity) =>
        Effect.all([
          Effect.flip(activity.addComment(host!, id, { body: "hi" })),
          Effect.flip(activity.listComments(host!, id, { cursor: "not-a-cursor!" })),
        ]).pipe(Effect.map((errors) => errors.map((e) => e._tag))),
    );

    expect(tags).toEqual(["SessionClosed", "InvalidCursor"]);
  });

  it("lets only the author delete a comment, which hides it", async () => {
    const result = await withSession({ states: ["accepted"] }, ([host, sam], id, activity) =>
      Effect.gen(function* () {
        const comment = yield* activity.addComment(sam!, id, { body: "Running late" });
        const notAuthor = yield* Effect.flip(activity.deleteComment(host!, comment.id));
        yield* activity.deleteComment(sam!, comment.id);
        const again = yield* Effect.flip(activity.deleteComment(sam!, comment.id));
        const list = yield* activity.listComments(host!, id, {});

        return { notAuthor: notAuthor._tag, again: again._tag, list: list.items };
      }),
    );

    expect(result).toEqual({ notAuthor: "NotCommentAuthor", again: "CommentNotFound", list: [] });
  });

  it("hides comments from players blocked either way", async () => {
    const bodies = await withSession(
      { states: ["accepted", "accepted", "accepted"], kind: "doubles" },
      ([host, sam, alex, kim], id, activity, db) =>
        Effect.gen(function* () {
          yield* activity.addComment(sam!, id, { body: "from Sam" });
          yield* activity.addComment(alex!, id, { body: "from Alex" });
          yield* activity.addComment(kim!, id, { body: "from Kim" });
          yield* db.insert(block).values([
            { blockerId: host!.id, blockedId: sam!.id },
            { blockerId: alex!.id, blockedId: host!.id },
          ]);
          const page = yield* activity.listComments(host!, id, {});

          return page.items.map((c) => c.body);
        }),
    );

    expect(bodies).toEqual(["from Kim"]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("SessionActivity scores", () => {
  it("records a singles score and lets the other side confirm it", async () => {
    const result = await withSession({ states: ["accepted"] }, ([host, sam], id, activity) =>
      Effect.gen(function* () {
        const recorded = yield* activity.recordResult(host!, id, singles(host!, sam!));

        const ownSide = yield* Effect.flip(
          activity.respondToResult(host!, id, { response: "confirm" }),
        );

        const confirmed = yield* activity.respondToResult(sam!, id, { response: "confirm" });

        const again = yield* Effect.flip(
          activity.respondToResult(sam!, id, { response: "dispute" }),
        );

        const reRecord = yield* Effect.flip(activity.recordResult(sam!, id, singles(sam!, host!)));
        const read = yield* activity.getResult(sam!, id);

        return { recorded, ownSide, confirmed, again, reRecord, read };
      }),
    );

    expect(result.recorded).toMatchObject({ status: "pending", winner: "a", respondedBy: null });
    expect(result.ownSide._tag).toBe("NotOnOtherSide");
    expect(result.confirmed.status).toBe("confirmed");
    expect(result.confirmed.respondedAt).toBeInstanceOf(Date);
    expect(result.again._tag).toBe("ResultConflict");
    expect(result.reRecord._tag).toBe("ResultConflict");
    expect(result.read).toMatchObject({
      status: "confirmed",
      sets: [
        [6, 4],
        [3, 6],
        [10, 7],
      ],
    });
  });

  it("lets a disputed score be recorded again", async () => {
    const result = await withSession({ states: ["accepted"] }, ([host, sam], id, activity) =>
      Effect.gen(function* () {
        yield* activity.recordResult(host!, id, singles(host!, sam!));
        const disputed = yield* activity.respondToResult(sam!, id, { response: "dispute" });

        const fixed = yield* activity.recordResult(sam!, id, {
          sideA: [sam!.id],
          sideB: [host!.id],
          sets: [
            [6, 4],
            [6, 4],
          ],
        });

        const confirmed = yield* activity.respondToResult(host!, id, { response: "confirm" });

        return { disputed, fixed, confirmed };
      }),
    );

    expect(result.disputed.status).toBe("disputed");
    expect(result.fixed).toMatchObject({ status: "pending", winner: "a", respondedBy: null });
    expect(result.confirmed.status).toBe("confirmed");
  });

  it("checks doubles sides: two each, all accepted, and only the other pair confirms", async () => {
    const result = await withSession(
      { kind: "doubles", states: ["accepted", "accepted", "accepted", "invited"] },
      ([host, partner, opp1, opp2, invited], id, activity) =>
        Effect.gen(function* () {
          const sets: NewSessionResult["sets"] = [
            [7, 5],
            [6, 2],
          ];

          const oneEach = yield* Effect.flip(
            activity.recordResult(host!, id, { sideA: [host!.id], sideB: [opp1!.id], sets }),
          );

          const notAccepted = yield* Effect.flip(
            activity.recordResult(host!, id, {
              sideA: [host!.id, partner!.id],
              sideB: [opp1!.id, invited!.id],
              sets,
            }),
          );

          yield* activity.recordResult(host!, id, {
            sideA: [host!.id, partner!.id],
            sideB: [opp1!.id, opp2!.id],
            sets,
          });

          const partnerTry = yield* Effect.flip(
            activity.respondToResult(partner!, id, { response: "confirm" }),
          );

          const confirmed = yield* activity.respondToResult(opp2!, id, { response: "confirm" });

          return { oneEach, notAccepted, partnerTry, confirmed };
        }),
    );

    expect(result.oneEach._tag).toBe("InvalidResult");
    expect(result.notAccepted._tag).toBe("InvalidResult");
    expect(result.partnerTry._tag).toBe("NotOnOtherSide");
    expect(result.confirmed).toMatchObject({ status: "confirmed", winner: "a" });
  });

  it("refuses scores before the start, for hitting, cancelled, or not involving the recorder", async () => {
    const future = await withSession(
      { states: ["accepted"], startsInHours: 3 },
      ([host, sam], id, activity) =>
        Effect.flip(activity.recordResult(host!, id, singles(host!, sam!))).pipe(
          Effect.map((e) => e._tag),
        ),
    );

    const hitting = await withSession(
      { kind: "hitting", states: ["accepted"] },
      ([host, sam], id, activity) =>
        Effect.flip(activity.recordResult(host!, id, singles(host!, sam!))).pipe(
          Effect.map((e) => e._tag),
        ),
    );

    const cancelled = await withSession(
      { states: ["accepted"], status: "cancelled" },
      ([host, sam], id, activity) =>
        Effect.flip(activity.recordResult(host!, id, singles(host!, sam!))).pipe(
          Effect.map((e) => e._tag),
        ),
    );

    const notMine = await withSession(
      { kind: "doubles", states: ["accepted", "accepted", "accepted"] },
      ([host, a, b, c], id, activity) =>
        Effect.flip(
          activity.recordResult(host!, id, {
            sideA: [a!.id, b!.id],
            sideB: [c!.id, a!.id],
            sets: [
              [6, 0],
              [6, 0],
            ],
          }),
        ).pipe(Effect.map((e) => e._tag)),
    );

    expect({ future, hitting, cancelled, notMine }).toEqual({
      future: "InvalidResult",
      hitting: "InvalidResult",
      cancelled: "SessionClosed",
      notMine: "InvalidResult",
    });
  });

  it("returns null before a score is recorded and keeps non-players out", async () => {
    const result = await withSession(
      { states: ["accepted", "declined"] },
      ([host, , declined], id, activity) =>
        Effect.gen(function* () {
          const none = yield* activity.getResult(host!, id);

          const noResult = yield* Effect.flip(
            activity.respondToResult(host!, id, { response: "confirm" }),
          );

          const outsider = yield* Effect.flip(activity.getResult(declined!, id));

          return { none, noResult: noResult._tag, outsider: outsider._tag };
        }),
    );

    expect(result).toEqual({
      none: null,
      noResult: "ResultNotFound",
      outsider: "NotSessionPlayer",
    });
  });
});
