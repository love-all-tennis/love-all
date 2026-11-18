import { SessionUser } from "@love-all/domain";
import { eq, inArray, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { BetterAuth } from "./BetterAuth";
import { Db } from "./Db";
import {
  accountSuspension,
  club,
  equipment,
  equipmentReview,
  clubReview,
  forumCategory,
  forumPost,
  forumThread,
  profile,
  report,
  session,
  user,
} from "./db/schema";
import { Equipment } from "./Equipment";
import { Forum } from "./Forum";
import { Moderation } from "./Moderation";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const TestLayer = Layer.mergeAll(
  Moderation.layer,
  Equipment.layer,
  Safety.layer.pipe(Layer.provideMerge(Forum.layer)),
  Players.layer,
  Profiles.layer,
).pipe(Layer.provide(makeNotificationsMemory().layer), Layer.provideMerge(Db.layer));

interface World {
  readonly players: ReadonlyArray<SessionUser>;
  readonly moderation: Moderation["Service"];
  readonly safety: Safety["Service"];
  readonly forum: Forum["Service"];
  readonly db: Db["Service"];
  readonly generalId: string;
}

const withWorld = <A, E>(
  count: number,
  f: (world: World) => Effect.Effect<A, E, Players | Profiles | Equipment>,
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
    expect(result.hiddenAgain._tag).toBe("TargetNotFound");
    expect(result.afterDelete).toMatchObject({
      resolution: "content_hidden",
      removed: true,
      clubId: null,
    });
  });

  it("lists a reported gear review with its item, then hides it from everyone", async () => {
    const result = await withWorld(3, ({ players: [admin, sam, alex], moderation, safety, db }) =>
      Effect.gen(function* () {
        const gear = yield* Equipment;

        const [item] = yield* db
          .insert(equipment)
          .values({ kind: "racket", brand: `Test${crypto.randomUUID().slice(0, 8)}`, model: "X" })
          .returning({ id: equipment.id });

        return yield* Effect.gen(function* () {
          const [review] = yield* db
            .insert(equipmentReview)
            .values({ equipmentId: item!.id, authorId: alex!.id, rating: 1, body: "Spam link" })
            .returning({ id: equipmentReview.id });

          const target = { targetType: "equipment_review" as const, targetId: review!.id };
          const own = yield* Effect.flip(safety.report(alex!, { ...target, reason: "spam" }));
          yield* safety.report(sam!, { ...target, reason: "spam" });

          const listed = (yield* moderation.listReports(admin!, { limit: 100 })).items.find(
            (r) => r.targetId === review!.id,
          );

          yield* moderation.hideContent(admin!, "equipment_review", review!.id);
          const reviews = yield* gear.listReviews(sam!, item!.id, {});
          const detail = yield* gear.get(sam!, item!.id);
          const again = yield* Effect.flip(safety.report(admin!, { ...target, reason: "spam" }));

          return { own, listed, reviews, detail, again, itemId: item!.id, alexId: alex!.id };
        }).pipe(
          Effect.ensuring(Effect.orDie(db.delete(equipment).where(eq(equipment.id, item!.id)))),
        );
      }),
    );

    expect(result.own._tag).toBe("CannotTargetSelf");
    expect(result.listed).toMatchObject({
      targetType: "equipment_review",
      equipmentId: result.itemId,
      clubId: null,
      threadId: null,
      subject: { id: result.alexId },
      hidden: false,
      removed: false,
    });
    expect(result.listed!.content).toMatch(/: 1 out of 5\n\nSpam link$/);
    expect(result.reviews.items).toEqual([]);
    expect(result.detail.rating.count).toBe(0);
    expect(result.again._tag).toBe("TargetNotFound");
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
    const email = `test_${crypto.randomUUID()}@example.com`;
    const body = { email, password: "correct-horse-battery", name: "Suspended" };

    const signIn = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* BetterAuth;
        const db = yield* Db;
        const signedUp = yield* Effect.promise(() => auth.api.signUpEmail({ body }));

        return yield* Effect.gen(function* () {
          yield* db.insert(accountSuspension).values({ userId: signedUp.user.id });

          return yield* Effect.promise(() =>
            auth.api.signInEmail({ body: { email, password: body.password } }).then(
              () => "signed in",
              (cause: unknown) => cause,
            ),
          );
        }).pipe(
          Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, signedUp.user.id)))),
        );
      }).pipe(Effect.provide(BetterAuth.layer.pipe(Layer.provideMerge(Db.layer)))),
    );

    expect(signIn).toMatchObject({ status: "FORBIDDEN" });
  });
});
