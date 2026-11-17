import { SessionUser } from "@love-all/domain";
import { eq, inArray, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { makeAuth } from "./auth";
import { Db } from "./Db";
import {
  accountSuspension,
  club,
  clubReview,
  forumCategory,
  forumPost,
  forumThread,
  profile,
  report,
  session,
  user,
} from "./db/schema";
import { Forum } from "./Forum";
import { Moderation } from "./Moderation";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

/** Runs against a migrated Postgres + PostGIS. Skipped when DATABASE_URL is not set. */
const TestLayer = Layer.mergeAll(
  Moderation.layer,
  Safety.layer.pipe(Layer.provideMerge(Forum.layer)),
  Players.layer,
  Profiles.layer,
).pipe(Layer.provide(makeNotificationsMemory().layer), Layer.provideMerge(Db.layer));

interface World {
  /** players[0] is an admin. */
  readonly players: ReadonlyArray<SessionUser>;
  readonly moderation: Moderation["Service"];
  readonly safety: Safety["Service"];
  readonly forum: Forum["Service"];
  readonly db: Db["Service"];
  readonly generalId: string;
}

/** Creates `count` accounts (the first an admin), runs `f`, then deletes them and their reports. */
const withWorld = <A, E>(
  count: number,
  f: (world: World) => Effect.Effect<A, E, Players | Profiles>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({
        id,
        name: `P${i}`,
        email: `${id}@example.com`,
        role: i === 0 ? "admin" : "player",
      });
    });
    const ids = players.map((p) => p.id);
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    yield* db
      .insert(profile)
      .values(players.map((p, i) => ({ userId: p.id, displayName: `Player ${i}` })));
    const [general] = yield* db
      .select({ id: forumCategory.id })
      .from(forumCategory)
      .where(eq(forumCategory.slug, "general"));
    return yield* f({
      players,
      moderation: yield* Moderation,
      safety: yield* Safety,
      forum: yield* Forum,
      db,
      generalId: general!.id,
    }).pipe(
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

describe.skipIf(!process.env.DATABASE_URL)("Moderation", () => {
  it("refuses players who aren't admins", async () => {
    const errors = await withWorld(2, ({ players: [, sam], moderation }) =>
      Effect.all([
        Effect.flip(moderation.listReports(sam!, {})),
        Effect.flip(moderation.suspend(sam!, "anyone", {})),
        Effect.flip(moderation.hideContent(sam!, "forum_post", crypto.randomUUID())),
      ]),
    );
    expect(errors.map((e) => e._tag)).toEqual(["NotModerator", "NotModerator", "NotModerator"]);
  });

  it("lists a reported post with its author, text and state, then hides it", async () => {
    const result = await withWorld(3, ({ players, moderation, safety, forum, db, generalId }) =>
      Effect.gen(function* () {
        const [admin, sam, alex] = players;
        const [thread] = yield* db
          .insert(forumThread)
          .values({ categoryId: generalId, authorId: sam!.id, title: "Hello", body: "Hi all" })
          .returning({ id: forumThread.id });
        yield* db.update(forumThread).set({ replyCount: 1 }).where(eq(forumThread.id, thread!.id));
        const [post] = yield* db
          .insert(forumPost)
          .values({ threadId: thread!.id, authorId: alex!.id, body: "Buy cheap balls" })
          .returning({ id: forumPost.id });
        const target = { targetType: "forum_post" as const, targetId: post!.id };
        yield* safety.report(sam!, { ...target, reason: "spam", details: "Selling" });
        yield* safety.report(admin!, { ...target, reason: "spam" });
        const open = yield* moderation.listReports(admin!, { limit: 100 });
        const mine = open.items.filter((r) => r.targetId === post!.id);

        yield* moderation.hideContent(admin!, "forum_post", post!.id);
        yield* moderation.hideContent(admin!, "forum_post", post!.id);
        const page = yield* forum.getThread(sam!, thread!.id, {});
        const afterHide = (yield* moderation.listReports(admin!, { limit: 100 })).items.filter(
          (r) => r.targetId === post!.id,
        );
        const resolved = (yield* moderation.listReports(admin!, {
          status: "resolved",
          limit: 100,
        })).items.filter((r) => r.targetId === post!.id);

        yield* moderation.unhideContent(admin!, "forum_post", post!.id);
        const unhidden = yield* forum.getThread(sam!, thread!.id, {});
        const missing = yield* Effect.flip(
          moderation.hideContent(admin!, "forum_thread", crypto.randomUUID()),
        );
        return {
          mine,
          page,
          afterHide,
          resolved,
          unhidden,
          missing,
          alexId: alex!.id,
          threadId: thread!.id,
        };
      }),
    );
    expect(result.mine).toHaveLength(2);
    const sams = result.mine.find((r) => r.details === "Selling")!;
    expect(sams).toMatchObject({
      reason: "spam",
      content: "Buy cheap balls",
      subject: { id: result.alexId, displayName: "Player 2", suspended: false },
      reporter: { displayName: "Player 1" },
      threadId: result.threadId,
      hidden: false,
      removed: false,
      openReportsOnTarget: 2,
      status: "open",
      resolution: null,
    });
    expect(result.page.replies).toEqual([]);
    expect(result.page.thread.replyCount).toBe(0);
    expect(result.afterHide).toEqual([]);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved[0]).toMatchObject({
      hidden: true,
      status: "resolved",
      resolution: "content_hidden",
    });
    expect(result.unhidden.replies).toHaveLength(1);
    expect(result.unhidden.thread.replyCount).toBe(1);
    expect(result.missing._tag).toBe("TargetNotFound");
  });

  it("reports a club review, lists it with its club, hides it and sees it deleted", async () => {
    const result = await withWorld(3, ({ players, moderation, safety, db }) =>
      Effect.gen(function* () {
        const [admin, sam, alex] = players;
        const [made] = yield* db
          .insert(club)
          .values({
            name: "Report Test Courts",
            point: { x: 170.5, y: -45.87 },
            access: "free",
            createdBy: sam!.id,
          })
          .returning({ id: club.id });
        return yield* Effect.gen(function* () {
          const [review] = yield* db
            .insert(clubReview)
            .values({ clubId: made!.id, authorId: alex!.id, rating: 1, body: "Call 555-0100" })
            .returning({ id: clubReview.id });
          const target = { targetType: "club_review" as const, targetId: review!.id };
          const own = yield* Effect.flip(safety.report(alex!, { ...target, reason: "spam" }));
          yield* safety.report(sam!, { ...target, reason: "spam" });
          const listed = (yield* moderation.listReports(admin!, { limit: 100 })).items.find(
            (r) => r.targetId === review!.id,
          );
          yield* moderation.hideContent(admin!, "club_review", review!.id);
          const [hiddenRow] = yield* db
            .select({ hiddenAt: clubReview.hiddenAt })
            .from(clubReview)
            .where(eq(clubReview.id, review!.id));
          const hiddenAgain = yield* Effect.flip(
            safety.report(admin!, { ...target, reason: "spam" }),
          );
          yield* db.delete(clubReview).where(eq(clubReview.id, review!.id));
          const afterDelete = (yield* moderation.listReports(admin!, {
            status: "resolved",
            limit: 100,
          })).items.find((r) => r.targetId === review!.id);
          return {
            own,
            listed,
            hiddenRow,
            hiddenAgain,
            afterDelete,
            clubId: made!.id,
            alexId: alex!.id,
          };
        }).pipe(Effect.ensuring(Effect.orDie(db.delete(club).where(eq(club.id, made!.id)))));
      }),
    );
    expect(result.own._tag).toBe("CannotTargetSelf");
    expect(result.listed).toMatchObject({
      targetType: "club_review",
      content: "1 star for Report Test Courts\n\nCall 555-0100",
      subject: { id: result.alexId },
      clubId: result.clubId,
      threadId: null,
      hidden: false,
      removed: false,
    });
    expect(result.hiddenRow?.hiddenAt).not.toBeNull();
    // Hidden reviews aren't anyone's to see, so they can't be reported again.
    expect(result.hiddenAgain._tag).toBe("TargetNotFound");
    expect(result.afterDelete).toMatchObject({
      resolution: "content_hidden",
      removed: true,
      clubId: null,
    });
  });

  it("dismisses every open report on the same target", async () => {
    const result = await withWorld(3, ({ players: [admin, sam, alex], moderation, safety }) =>
      Effect.gen(function* () {
        const target = { targetType: "player" as const, targetId: alex!.id };
        const first = yield* safety.report(sam!, { ...target, reason: "fake_profile" });
        yield* safety.report(admin!, { ...target, reason: "spam" });
        yield* moderation.dismissReport(admin!, first.id);
        const open = (yield* moderation.listReports(admin!, { limit: 100 })).items.filter(
          (r) => r.targetId === alex!.id,
        );
        const unknown = yield* Effect.flip(moderation.dismissReport(admin!, crypto.randomUUID()));
        return { open, unknown };
      }),
    );
    expect(result.open).toEqual([]);
    expect(result.unknown._tag).toBe("ReportNotFound");
  });

  it("suspends a player: signs them out, hides them from search and closes reports about them", async () => {
    const result = await withWorld(3, ({ players: [admin, sam, alex], moderation, safety, db }) =>
      Effect.gen(function* () {
        const players = yield* Players;
        const profiles = yield* Profiles;
        // Tromsø, away from the points other test files search around.
        for (const [i, p] of [sam!, alex!].entries()) {
          yield* profiles.update(p, { homePoint: { lat: 69.65 + i / 100, lng: 18.96 } });
        }
        yield* db.insert(session).values({
          id: `s_${alex!.id}`,
          token: `t_${alex!.id}`,
          userId: alex!.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        });
        yield* safety.report(sam!, {
          targetType: "player",
          targetId: alex!.id,
          reason: "harassment",
        });
        const self = yield* Effect.flip(moderation.suspend(admin!, admin!.id, {}));
        yield* moderation.suspend(admin!, alex!.id, { reason: "Harassing players" });
        yield* moderation.suspend(admin!, alex!.id, {});
        const sessions = yield* db.select().from(session).where(eq(session.userId, alex!.id));
        const [suspension] = yield* db
          .select()
          .from(accountSuspension)
          .where(eq(accountSuspension.userId, alex!.id));
        const search = (yield* players.search(sam!, { radiusKm: 5 })).items.map((p) => p.id);
        const resolved = (yield* moderation.listReports(admin!, {
          status: "resolved",
          limit: 100,
        })).items.filter((r) => r.targetId === alex!.id);
        yield* moderation.unsuspend(admin!, alex!.id);
        const searchAfter = (yield* players.search(sam!, { radiusKm: 5 })).items.map((p) => p.id);
        return { self, sessions, suspension, search, resolved, searchAfter, alexId: alex!.id };
      }),
    );
    expect(result.self._tag).toBe("CannotTargetSelf");
    expect(result.sessions).toEqual([]);
    expect(result.suspension).toMatchObject({ reason: "Harassing players" });
    expect(result.search).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      resolution: "player_suspended",
      subject: { id: result.alexId, suspended: true },
    });
    expect(result.searchAfter).toEqual([result.alexId]);
  });

  it("stops a suspended player signing in", async () => {
    const auth = makeAuth({ databaseUrl: process.env.DATABASE_URL!, trustedOrigins: [] });
    const email = `test_${crypto.randomUUID()}@example.com`;
    const body = { email, password: "correct-horse-battery", name: "Suspended" };
    const signedUp = await auth.api.signUpEmail({ body });
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.insert(accountSuspension).values({ userId: signedUp.user.id });
        }).pipe(Effect.provide(Db.layer)),
      );
      await expect(
        auth.api.signInEmail({ body: { email, password: body.password } }),
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
    } finally {
      await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.delete(user).where(eq(user.id, signedUp.user.id));
        }).pipe(Effect.provide(Db.layer)),
      );
    }
  });
});
