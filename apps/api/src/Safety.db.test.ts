import { SessionUser } from "@love-all/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { forumCategory, forumPost, forumThread, profile, report, user } from "./db/schema";
import { Follows } from "./Follows";
import { Forum } from "./Forum";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

/** Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set. */
const TestLayer = Layer.mergeAll(
  Safety.layer.pipe(Layer.provideMerge(Forum.layer)),
  Players.layer,
  Profiles.layer,
  Follows.layer,
).pipe(Layer.provide(makeNotificationsMemory().layer), Layer.provideMerge(Db.layer));

/** Creates `count` throwaway accounts, runs `f` with them, then deletes them. */
const withPlayers = <A, E>(
  count: number,
  f: (
    players: ReadonlyArray<SessionUser>,
    safety: Safety["Service"],
    db: Db["Service"],
  ) => Effect.Effect<A, E, Players | Profiles | Follows | Forum>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const safety = yield* Safety;
    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    const ids = players.map((p) => p.id);
    return yield* f(players, safety, db).pipe(
      Effect.ensuring(
        Effect.orDie(
          Effect.andThen(
            db
              .delete(report)
              .where(or(inArray(report.targetId, ids), inArray(report.subjectId, ids))),
            db.delete(user).where(inArray(user.id, ids)),
          ),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

describe.skipIf(!process.env.DATABASE_URL)("Safety", () => {
  it("blocks a player once, lists them, and unblocks", async () => {
    const result = await withPlayers(2, ([sam, alex], safety, db) =>
      Effect.gen(function* () {
        yield* db.insert(profile).values({ userId: alex!.id, displayName: "Alex" });
        yield* safety.block(sam!, alex!.id);
        yield* safety.block(sam!, alex!.id);
        const listed = yield* safety.listBlocks(sam!);
        const theirs = yield* safety.listBlocks(alex!);
        yield* safety.unblock(sam!, alex!.id);
        yield* safety.unblock(sam!, alex!.id);
        const after = yield* safety.listBlocks(sam!);
        return { listed, theirs, after };
      }),
    );
    expect(result.listed).toHaveLength(1);
    expect(result.listed[0]).toMatchObject({ displayName: "Alex", photoUrl: null });
    expect(result.listed[0]!.blockedAt).toBeInstanceOf(Date);
    expect(result.theirs).toEqual([]);
    expect(result.after).toEqual([]);
  });

  it("lists a blocked player with no profile with a null name", async () => {
    const listed = await withPlayers(2, ([sam, alex], safety) =>
      safety.block(sam!, alex!.id).pipe(Effect.andThen(safety.listBlocks(sam!))),
    );
    expect(listed[0]).toMatchObject({ id: expect.any(String), displayName: null });
  });

  it("refuses to block yourself or an unknown player", async () => {
    const errors = await withPlayers(1, ([sam], safety) =>
      Effect.all([
        Effect.flip(safety.block(sam!, sam!.id)),
        Effect.flip(safety.block(sam!, "nobody")),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["CannotTargetSelf", "TargetNotFound"]);
  });

  it("hides players from each other whichever side blocked", async () => {
    const visible = await withPlayers(3, ([sam, alex, jo], safety, db) =>
      Effect.gen(function* () {
        const ids = [sam!.id, alex!.id, jo!.id];
        const seenBy = (viewer: SessionUser) =>
          db
            .select({ id: user.id })
            .from(user)
            .where(and(inArray(user.id, ids), notBlocked(viewer.id, user.id)))
            .pipe(Effect.map((rows) => rows.map((r) => r.id).sort()));
        yield* safety.block(alex!, sam!.id);
        return {
          sam: yield* seenBy(sam!),
          alex: yield* seenBy(alex!),
          jo: yield* seenBy(jo!),
          ids: { sam: sam!.id, alex: alex!.id, jo: jo!.id },
        };
      }),
    );
    expect(visible.sam).toEqual([visible.ids.sam, visible.ids.jo].sort());
    expect(visible.alex).toEqual([visible.ids.alex, visible.ids.jo].sort());
    expect(visible.jo).toHaveLength(3);
  });

  it("files an open report and keeps it after the reporter's account is gone", async () => {
    const saved = await withPlayers(2, ([sam, alex], safety, db) =>
      Effect.gen(function* () {
        const created = yield* safety.report(sam!, {
          targetType: "player",
          targetId: alex!.id,
          reason: "harassment",
          details: "Rude messages after our match",
        });
        yield* db.delete(user).where(eq(user.id, sam!.id));
        const [row] = yield* db.select().from(report).where(eq(report.id, created.id));
        return row;
      }),
    );
    expect(saved).toMatchObject({
      reporterId: null,
      targetType: "player",
      content: null,
      reason: "harassment",
      details: "Rude messages after our match",
      status: "open",
      resolvedAt: null,
    });
  });

  it("reports a forum thread and a reply with their author and a copy of the text", async () => {
    const saved = await withPlayers(2, ([sam, alex], safety, db) =>
      Effect.gen(function* () {
        const [general] = yield* db
          .select({ id: forumCategory.id })
          .from(forumCategory)
          .where(eq(forumCategory.slug, "general"));
        const [thread] = yield* db
          .insert(forumThread)
          .values({
            categoryId: general!.id,
            authorId: alex!.id,
            title: "Cheap rackets",
            body: "DM me",
          })
          .returning({ id: forumThread.id });
        const [post] = yield* db
          .insert(forumPost)
          .values({ threadId: thread!.id, authorId: alex!.id, body: "Still selling" })
          .returning({ id: forumPost.id });
        const onThread = yield* safety.report(sam!, {
          targetType: "forum_thread",
          targetId: thread!.id,
          reason: "spam",
        });
        const onPost = yield* safety.report(sam!, {
          targetType: "forum_post",
          targetId: post!.id,
          reason: "spam",
        });
        const ownPost = yield* Effect.flip(
          safety.report(alex!, { targetType: "forum_post", targetId: post!.id, reason: "spam" }),
        );
        // Once hidden by a moderator, it can't be reported again.
        yield* db.update(forumPost).set({ hiddenAt: new Date() }).where(eq(forumPost.id, post!.id));
        const hidden = yield* Effect.flip(
          safety.report(sam!, { targetType: "forum_post", targetId: post!.id, reason: "spam" }),
        );
        const unknown = yield* Effect.flip(
          safety.report(sam!, {
            targetType: "forum_thread",
            targetId: "not-a-uuid",
            reason: "spam",
          }),
        );
        const rows = yield* db
          .select()
          .from(report)
          .where(inArray(report.id, [onThread.id, onPost.id]));
        return { rows, errors: [ownPost._tag, hidden._tag, unknown._tag], alex: alex!.id };
      }),
    );
    expect(saved.errors).toEqual(["CannotTargetSelf", "TargetNotFound", "TargetNotFound"]);
    expect(saved.rows).toHaveLength(2);
    const byType = Object.fromEntries(saved.rows.map((row) => [row.targetType, row]));
    expect(byType.forum_thread).toMatchObject({
      subjectId: saved.alex,
      content: "Cheap rackets\n\nDM me",
    });
    expect(byType.forum_post).toMatchObject({ subjectId: saved.alex, content: "Still selling" });
  });

  it("refuses to report yourself or an unknown player", async () => {
    const errors = await withPlayers(1, ([sam], safety) =>
      Effect.all([
        Effect.flip(
          safety.report(sam!, { targetType: "player", targetId: sam!.id, reason: "spam" }),
        ),
        Effect.flip(
          safety.report(sam!, { targetType: "player", targetId: "nobody", reason: "spam" }),
        ),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["CannotTargetSelf", "TargetNotFound"]);
  });

  it("hides blocked players from search, profiles and follows, and ends follows both ways", async () => {
    const result = await withPlayers(3, ([sam, alex, jo], safety) =>
      Effect.gen(function* () {
        const players = yield* Players;
        const profiles = yield* Profiles;
        const follows = yield* Follows;
        // Reykjavik, far from the points other test files search around.
        for (const [i, p] of [sam!, alex!, jo!].entries()) {
          yield* profiles.update(p, { homePoint: { lat: 64.14 + i / 100, lng: -21.94 } });
        }
        yield* follows.follow(sam!, alex!.id);
        yield* follows.follow(alex!, sam!.id);
        yield* follows.follow(sam!, jo!.id);
        yield* safety.block(alex!, sam!.id);
        return {
          samSees: (yield* players.search(sam!, { radiusKm: 5 })).items.map((p) => p.id),
          alexSees: (yield* players.search(alex!, { radiusKm: 5 })).items.map((p) => p.id),
          samGetsAlex: yield* Effect.flip(players.get(sam!, alex!.id)),
          samFollows: (yield* follows.list(sam!)).items.map((p) => p.id),
          alexFollows: (yield* follows.list(alex!)).items,
          refollow: yield* Effect.flip(follows.follow(sam!, alex!.id)),
          ids: { alex: alex!.id, jo: jo!.id },
        };
      }),
    );
    expect(result.samSees).toEqual([result.ids.jo]);
    expect(result.alexSees).toEqual([result.ids.jo]);
    expect(result.samGetsAlex._tag).toBe("PlayerNotFound");
    expect(result.samFollows).toEqual([result.ids.jo]);
    expect(result.alexFollows).toEqual([]);
    expect(result.refollow._tag).toBe("PlayerNotFound");
  });
});
