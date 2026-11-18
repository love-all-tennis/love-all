import { eq, inArray, or } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { SessionUser } from "@love-all/domain";
import { BetterAuth } from "./BetterAuth";
import { Db } from "./Db";
import { Forum } from "./Forum";
import { Sessions } from "./Sessions";
import {
  account,
  accountSuspension,
  availability,
  block,
  club,
  clubReview,
  conversation,
  conversationMember,
  directMessage,
  equipment,
  equipmentReview,
  follow,
  forumCategory,
  forumPost,
  forumReaction,
  forumThread,
  playSession,
  playSessionComment,
  playSessionParticipant,
  playSessionResult,
  profile,
  pushToken,
  report,
  session,
  user,
} from "./db/schema";
import { makeAppleTokensMemory } from "./testing/AppleTokensMemory";
import { betterAuthTestLayer } from "./testing/BetterAuthTest";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const HOUR = 60 * 60 * 1000;

const makeTest = () => {
  const sent = makeNotificationsMemory();
  const apple = makeAppleTokensMemory();

  return {
    layer: Layer.mergeAll(Forum.layer, Sessions.layer).pipe(
      Layer.provide(sent.layer),
      Layer.provideMerge(betterAuthTestLayer(sent.layer, apple.layer)),
    ),
    notices: sent.notices,
    revoked: apple.revoked,
  };
};

const cookieFrom = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const signUp = (auth: BetterAuth["Service"], name: string) =>
  Effect.gen(function* () {
    const email = `test_${crypto.randomUUID()}@example.com`;
    const password = "correct-horse-battery";

    const { headers, response } = yield* Effect.promise(() =>
      auth.api.signUpEmail({ body: { email, password, name }, returnHeaders: true }),
    );

    return { id: response.user.id, password, cookie: cookieFrom(headers) };
  });

const rejection = <A>(f: () => Promise<A>) =>
  Effect.tryPromise(f).pipe(
    Effect.flip,
    Effect.map((error) => error.cause),
  );

const session_ = (hostId: string, startsAt: Date, status: "open" | "confirmed" = "open") => ({
  hostId,
  kind: "singles" as const,
  startsAt,
  durationMinutes: 90,
  courtName: "Palmer Park",
  spots: 2,
  visibility: "open" as const,
  status,
});

const asPlayer = (id: string, name: string) =>
  new SessionUser({ id, name, email: `${id}@example.com`, role: "player" });

describe.skipIf(!process.env.DATABASE_URL)("deleting an account", () => {
  it("asks for the password of an email account", async () => {
    const test = makeTest();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* BetterAuth;
        const db = yield* Db;
        const sam = yield* signUp(auth, "Sam");

        return yield* Effect.gen(function* () {
          const headers = new Headers({ cookie: sam.cookie });
          const missing = yield* rejection(() => auth.api.deleteUser({ body: {}, headers }));

          const wrong = yield* rejection(() =>
            auth.api.deleteUser({ body: { password: "not-my-password" }, headers }),
          );

          const still = yield* db.select({ id: user.id }).from(user).where(eq(user.id, sam.id));

          return { missing, wrong, still };
        }).pipe(Effect.ensuring(Effect.orDie(db.delete(user).where(eq(user.id, sam.id)))));
      }).pipe(Effect.provide(test.layer)),
    );

    expect(result.missing).toMatchObject({ body: { code: "PASSWORD_REQUIRED" } });
    expect(result.wrong).toMatchObject({ body: { code: "INVALID_PASSWORD" } });
    expect(result.still).toHaveLength(1);
  });

  it("removes a player with data everywhere and keeps what others see", async () => {
    const test = makeTest();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const auth = yield* BetterAuth;
        const db = yield* Db;
        const sam = yield* signUp(auth, "Sam");
        const alex = yield* signUp(auth, "Alex");
        const jo = yield* signUp(auth, "Jo");
        // WARNING: a 0000_ id sorts before Better Auth ids in both code-point and en_US order.
        const penPalId = `0000_${crypto.randomUUID()}`;
        const others = [alex.id, jo.id, penPalId];
        const now = Date.now();

        return yield* Effect.gen(function* () {
          const [samProfile] = yield* db
            .insert(profile)
            .values([
              { userId: sam.id, displayName: "Sam", ntrp: "3.5" },
              { userId: alex.id, displayName: "Alex", ntrp: "3.5" },
              { userId: jo.id, displayName: "Jo", ntrp: "3.5" },
            ])
            .returning({ id: profile.id });

          yield* db.insert(availability).values({
            profileId: samProfile!.id,
            weekday: 2,
            startTime: "18:00",
            endTime: "21:00",
          });
          yield* db.insert(follow).values([
            { followerId: sam.id, followedId: alex.id },
            { followerId: alex.id, followedId: sam.id },
          ]);
          yield* db.insert(block).values({ blockerId: sam.id, blockedId: jo.id });
          yield* db
            .insert(pushToken)
            .values({ token: `ExponentPushToken[${sam.id}]`, userId: sam.id, platform: "ios" });
          yield* db.insert(account).values({
            id: crypto.randomUUID(),
            userId: sam.id,
            accountId: `apple_${sam.id}`,
            providerId: "apple",
            refreshToken: "apple-refresh-token",
            accessToken: "apple-access-token",
          });

          const [hosting, hostedPast, joined, scored] = yield* db
            .insert(playSession)
            .values([
              session_(sam.id, new Date(now + 24 * HOUR)),
              session_(sam.id, new Date(now - 24 * HOUR), "confirmed"),
              session_(alex.id, new Date(now + 48 * HOUR), "confirmed"),
              session_(alex.id, new Date(now - 48 * HOUR), "confirmed"),
            ])
            .returning({ id: playSession.id });

          yield* db.insert(playSessionParticipant).values([
            { sessionId: hosting!.id, userId: sam.id, role: "host", state: "accepted" },
            { sessionId: hosting!.id, userId: alex.id, state: "accepted" },
            { sessionId: hostedPast!.id, userId: sam.id, role: "host", state: "accepted" },
            { sessionId: hostedPast!.id, userId: jo.id, state: "accepted" },
            { sessionId: joined!.id, userId: alex.id, role: "host", state: "accepted" },
            { sessionId: joined!.id, userId: sam.id, state: "accepted" },
            { sessionId: scored!.id, userId: alex.id, role: "host", state: "accepted" },
            { sessionId: scored!.id, userId: sam.id, state: "accepted" },
          ]);
          yield* db
            .insert(playSessionComment)
            .values({ sessionId: joined!.id, authorId: sam.id, body: "I'll bring balls" });
          yield* db.insert(playSessionResult).values({
            sessionId: scored!.id,
            sideA: [sam.id],
            sideB: [alex.id],
            sets: [
              [6, 4],
              [6, 3],
            ],
            winner: "a",
            recordedBy: sam.id,
          });

          const [general] = yield* db
            .select({ id: forumCategory.id })
            .from(forumCategory)
            .where(eq(forumCategory.slug, "general"));

          const [samThread, alexThread] = yield* db
            .insert(forumThread)
            .values([
              { categoryId: general!.id, authorId: sam.id, title: "Hi", body: "New here" },
              {
                categoryId: general!.id,
                authorId: alex.id,
                title: "Strings",
                body: "Poly or gut?",
                replyCount: 3,
              },
            ])
            .returning({ id: forumThread.id });

          yield* db.insert(forumPost).values([
            { threadId: samThread!.id, authorId: alex.id, body: "Welcome" },
            { threadId: alexThread!.id, authorId: sam.id, body: "Gut" },
            { threadId: alexThread!.id, authorId: sam.id, body: "Poly", deletedAt: new Date() },
            { threadId: alexThread!.id, authorId: jo.id, body: "Hybrid" },
            { threadId: alexThread!.id, authorId: alex.id, body: "Thanks" },
          ]);
          yield* db
            .insert(forumReaction)
            .values({ threadId: alexThread!.id, userId: sam.id, kind: "like" });

          yield* db
            .insert(user)
            .values({ id: penPalId, name: "Pen pal", email: `${penPalId}@example.com` });

          const [convo] = yield* db
            .insert(conversation)
            .values({
              userLowId: penPalId,
              userHighId: sam.id,
              startedById: sam.id,
              lastMessageAt: new Date(),
            })
            .returning({ id: conversation.id });

          yield* db.insert(conversationMember).values([
            { conversationId: convo!.id, userId: sam.id },
            { conversationId: convo!.id, userId: penPalId },
          ]);
          yield* db.insert(directMessage).values([
            { conversationId: convo!.id, senderId: sam.id, body: "Saturday?" },
            { conversationId: convo!.id, senderId: penPalId, body: "Sure" },
          ]);

          const [samClub] = yield* db
            .insert(club)
            .values({
              name: `Club ${sam.id}`,
              point: { x: -83.05, y: 42.33 },
              access: "free",
              createdBy: sam.id,
            })
            .returning({ id: club.id });

          yield* db.insert(clubReview).values([
            { clubId: samClub!.id, authorId: sam.id, rating: 5 },
            { clubId: samClub!.id, authorId: alex.id, rating: 4 },
          ]);

          const [samGear] = yield* db
            .insert(equipment)
            .values({ kind: "racket", brand: "Test", model: sam.id, createdBy: sam.id })
            .returning({ id: equipment.id });

          yield* db
            .insert(equipmentReview)
            .values({ equipmentId: samGear!.id, authorId: sam.id, rating: 4 });

          yield* db.insert(report).values([
            {
              reporterId: sam.id,
              targetType: "player",
              targetId: jo.id,
              subjectId: jo.id,
              reason: "spam",
            },
            {
              reporterId: alex.id,
              targetType: "player",
              targetId: sam.id,
              subjectId: sam.id,
              reason: "harassment",
              status: "resolved",
              resolution: "dismissed",
              resolvedById: sam.id,
              resolvedAt: new Date(),
            },
          ]);
          yield* db.insert(accountSuspension).values({ userId: sam.id, suspendedById: alex.id });

          const deleted = yield* Effect.promise(() =>
            auth.api.deleteUser({
              body: { password: sam.password },
              headers: new Headers({ cookie: sam.cookie }),
            }),
          );

          const forum = yield* Forum;
          const sessions = yield* Sessions;

          const seen = {
            thread: yield* forum.getThread(asPlayer(alex.id, "Alex"), samThread!.id, {}),
            replies: yield* forum.getThread(asPlayer(alex.id, "Alex"), alexThread!.id, {}),
            session: yield* sessions.get(asPlayer(jo.id, "Jo"), hostedPast!.id),
          };

          const left = {
            user: yield* db.select().from(user).where(eq(user.id, sam.id)),
            sessions: yield* db.select().from(session).where(eq(session.userId, sam.id)),
            accounts: yield* db.select().from(account).where(eq(account.userId, sam.id)),
            profile: yield* db.select().from(profile).where(eq(profile.userId, sam.id)),
            availability: yield* db
              .select()
              .from(availability)
              .where(eq(availability.profileId, samProfile!.id)),
            follows: yield* db
              .select()
              .from(follow)
              .where(or(eq(follow.followerId, sam.id), eq(follow.followedId, sam.id))),
            blocks: yield* db.select().from(block).where(eq(block.blockerId, sam.id)),
            pushTokens: yield* db.select().from(pushToken).where(eq(pushToken.userId, sam.id)),
            suspension: yield* db
              .select()
              .from(accountSuspension)
              .where(eq(accountSuspension.userId, sam.id)),
            hosted: yield* db.select().from(playSession).where(eq(playSession.hostId, sam.id)),
            places: yield* db
              .select()
              .from(playSessionParticipant)
              .where(eq(playSessionParticipant.userId, sam.id)),
            comments: yield* db
              .select()
              .from(playSessionComment)
              .where(eq(playSessionComment.authorId, sam.id)),
            results: yield* db
              .select()
              .from(playSessionResult)
              .where(eq(playSessionResult.recordedBy, sam.id)),
            threads: yield* db.select().from(forumThread).where(eq(forumThread.authorId, sam.id)),
            posts: yield* db.select().from(forumPost).where(eq(forumPost.authorId, sam.id)),
            reactions: yield* db
              .select()
              .from(forumReaction)
              .where(eq(forumReaction.userId, sam.id)),
            conversations: yield* db
              .select()
              .from(conversation)
              .where(eq(conversation.id, convo!.id)),
            messages: yield* db
              .select()
              .from(directMessage)
              .where(eq(directMessage.conversationId, convo!.id)),
            clubReviews: yield* db.select().from(clubReview).where(eq(clubReview.authorId, sam.id)),
            gearReviews: yield* db
              .select()
              .from(equipmentReview)
              .where(eq(equipmentReview.authorId, sam.id)),
          };

          const kept = {
            joined: yield* db
              .select({ status: playSession.status })
              .from(playSession)
              .where(eq(playSession.id, joined!.id)),
            hosted: yield* db
              .select({
                id: playSession.id,
                hostId: playSession.hostId,
                status: playSession.status,
              })
              .from(playSession)
              .where(inArray(playSession.id, [hosting!.id, hostedPast!.id])),
            result: yield* db
              .select({ recordedBy: playSessionResult.recordedBy, sideA: playSessionResult.sideA })
              .from(playSessionResult)
              .where(eq(playSessionResult.sessionId, scored!.id)),
            threads: yield* db
              .select({
                id: forumThread.id,
                authorId: forumThread.authorId,
                replyCount: forumThread.replyCount,
              })
              .from(forumThread)
              .where(inArray(forumThread.id, [samThread!.id, alexThread!.id])),
            replies: yield* db
              .select({ body: forumPost.body, authorId: forumPost.authorId })
              .from(forumPost)
              .where(inArray(forumPost.threadId, [samThread!.id, alexThread!.id])),
            club: yield* db
              .select({ createdBy: club.createdBy })
              .from(club)
              .where(eq(club.id, samClub!.id)),
            clubReviews: yield* db
              .select({ authorId: clubReview.authorId })
              .from(clubReview)
              .where(eq(clubReview.clubId, samClub!.id)),
            gear: yield* db
              .select({ createdBy: equipment.createdBy })
              .from(equipment)
              .where(eq(equipment.id, samGear!.id)),
            reports: yield* db
              .select({
                reporterId: report.reporterId,
                subjectId: report.subjectId,
                resolvedById: report.resolvedById,
              })
              .from(report)
              .where(inArray(report.targetId, [sam.id, jo.id])),
          };

          yield* db
            .delete(playSession)
            .where(inArray(playSession.id, [hosting!.id, hostedPast!.id]));
          yield* db.delete(forumThread).where(eq(forumThread.id, samThread!.id));
          yield* db.delete(club).where(eq(club.id, samClub!.id));
          yield* db.delete(equipment).where(eq(equipment.id, samGear!.id));
          yield* db.delete(report).where(inArray(report.targetId, [sam.id, jo.id]));

          return {
            deleted,
            seen,
            left,
            kept,
            sam,
            alex,
            jo,
            hosting: hosting!.id,
            hostedPast: hostedPast!.id,
            samThread: samThread!.id,
            alexThread: alexThread!.id,
          };
        }).pipe(
          Effect.ensuring(
            Effect.orDie(db.delete(user).where(inArray(user.id, [sam.id, ...others]))),
          ),
        );
      }).pipe(Effect.provide(test.layer)),
    );

    expect(result.deleted).toEqual({ success: true, message: "User deleted" });

    for (const [table, rows] of Object.entries(result.left)) {
      expect({ table, rows }).toEqual({ table, rows: [] });
    }

    expect(result.seen.thread.thread.author).toBeNull();
    expect(result.seen.thread.thread.title).toBe("Hi");
    expect(result.seen.replies.replies.map((r) => [r.body, r.author?.displayName ?? null])).toEqual(
      expect.arrayContaining([
        ["Gut", null],
        ["Hybrid", "Jo"],
      ]),
    );
    expect(result.seen.session.host).toBeNull();
    expect(result.seen.session.participants.map((p) => p.player.displayName)).toEqual(["Jo"]);

    expect(result.kept.joined).toEqual([{ status: "open" }]);
    expect(result.kept.hosted).toEqual(
      expect.arrayContaining([
        { id: result.hosting, hostId: null, status: "cancelled" },
        { id: result.hostedPast, hostId: null, status: "confirmed" },
      ]),
    );
    expect(result.kept.result).toEqual([{ recordedBy: null, sideA: [result.sam.id] }]);
    expect(result.kept.threads).toEqual(
      expect.arrayContaining([
        { id: result.samThread, authorId: null, replyCount: 0 },
        { id: result.alexThread, authorId: result.alex.id, replyCount: 3 },
      ]),
    );
    expect(result.kept.replies).toHaveLength(5);
    expect(result.kept.replies).toEqual(
      expect.arrayContaining([
        { body: "Welcome", authorId: result.alex.id },
        { body: "Gut", authorId: null },
        { body: "Poly", authorId: null },
        { body: "Hybrid", authorId: result.jo.id },
      ]),
    );
    expect(result.kept.club).toEqual([{ createdBy: null }]);
    expect(result.kept.clubReviews).toEqual([{ authorId: result.alex.id }]);
    expect(result.kept.gear).toEqual([{ createdBy: null }]);
    expect(result.kept.reports).toHaveLength(2);
    expect(result.kept.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reporterId: null }),
        { reporterId: result.alex.id, subjectId: null, resolvedById: null },
      ]),
    );

    expect(test.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: [result.alex.id],
          from: result.sam.id,
          title: "Session cancelled",
        }),
        expect.objectContaining({
          to: [result.alex.id],
          from: result.sam.id,
          title: "Sam left",
        }),
      ]),
    );
    expect(test.revoked).toEqual([{ value: "apple-refresh-token", kind: "refresh_token" }]);
  });
});
