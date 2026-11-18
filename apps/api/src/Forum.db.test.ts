import { SessionUser } from "@love-all/domain";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { block, forumCategory, forumPost, forumThread, metro, profile, user } from "./db/schema";
import { Forum } from "./Forum";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const sent = makeNotificationsMemory();
const TestLayer = Forum.layer.pipe(Layer.provide(sent.layer), Layer.provideMerge(Db.layer));

interface World {
  readonly players: ReadonlyArray<SessionUser>;
  readonly forum: Forum["Service"];
  readonly db: Db["Service"];
  readonly categoryId: string;
  readonly metroId: string;
  readonly localCategoryId: string;
}

const withForum = <A, E>(
  setup: { readonly count: number; readonly inMetro?: ReadonlyArray<number> },
  f: (world: World) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const forum = yield* Forum;
    const tag = crypto.randomUUID().slice(0, 8);
    const players = Array.from({ length: setup.count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;
      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });
    const ids = players.map((p) => p.id);
    const [testMetro] = yield* db
      .insert(metro)
      .values({
        slug: `test-dunedin-${tag}`,
        name: "Dunedin",
        centerPoint: { x: 170.5, y: -45.87 },
        radiusKm: 30,
      })
      .returning({ id: metro.id });
    const [category, local] = yield* db
      .insert(forumCategory)
      .values([
        { slug: `test-${tag}`, name: "Test category", sortOrder: 99 },
        {
          slug: `test-local-${tag}`,
          name: "Dunedin Local",
          sortOrder: 0,
          metroId: testMetro!.id,
        },
      ])
      .returning({ id: forumCategory.id });
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));
    return yield* Effect.gen(function* () {
      yield* db.insert(profile).values(
        players.map((p, i) => ({
          userId: p.id,
          displayName: `Player ${i}`,
          metroId: setup.inMetro?.includes(i) ? testMetro!.id : null,
        })),
      );
      return yield* f({
        players,
        forum,
        db,
        categoryId: category!.id,
        metroId: testMetro!.id,
        localCategoryId: local!.id,
      });
    }).pipe(
      Effect.ensuring(
        Effect.orDie(
          Effect.all([
            db.delete(user).where(inArray(user.id, ids)),
            db.delete(forumCategory).where(eq(forumCategory.id, category!.id)),
            db.delete(metro).where(eq(metro.id, testMetro!.id)),
          ]),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const thread = (categoryId: string, title: string) => ({ categoryId, title, body: `${title}!` });

describe.skipIf(!process.env.DATABASE_URL)("Forum categories", () => {
  it("shows the global categories to everyone and a Local one only to its metro", async () => {
    const result = await withForum({ count: 2, inMetro: [0] }, ({ players, forum }) =>
      Effect.all({
        local: forum.listCategories(players[0]!),
        noMetro: forum.listCategories(players[1]!),
      }),
    );
    const slugs = (list: typeof result.local) => list.map((c) => c.slug);
    for (const list of [result.local, result.noMetro]) {
      expect(slugs(list)).toEqual(
        expect.arrayContaining(["general", "find-a-partner", "gear-talk", "technique"]),
      );
      expect(slugs(list)).not.toContain("detroit-local");
    }
    expect(result.local[0]!.name).toBe("Dunedin Local");
    expect(result.local.filter((c) => c.metroId !== null)).toHaveLength(1);
    expect(result.noMetro.filter((c) => c.metroId !== null)).toHaveLength(0);
  });

  it("shows Detroit Local to players in the Detroit metro", async () => {
    const categories = await withForum({ count: 1 }, ({ players, forum, db }) =>
      Effect.gen(function* () {
        const [detroit] = yield* db
          .select({ id: metro.id })
          .from(metro)
          .where(eq(metro.slug, "detroit"));
        yield* db
          .update(profile)
          .set({ metroId: detroit!.id })
          .where(eq(profile.userId, players[0]!.id));
        return yield* forum.listCategories(players[0]!);
      }),
    );
    expect(categories[0]).toMatchObject({ slug: "detroit-local", name: "Detroit Local" });
  });

  it("gives each category its latest visible thread", async () => {
    const category = await withForum({ count: 2 }, ({ players, forum, categoryId }) =>
      Effect.gen(function* () {
        yield* forum.createThread(players[0]!, thread(categoryId, "First"));
        const second = yield* forum.createThread(players[1]!, thread(categoryId, "Second"));
        yield* forum.deleteThread(players[1]!, second.id);
        const list = yield* forum.listCategories(players[0]!);
        return list.find((c) => c.id === categoryId);
      }),
    );
    expect(category?.latestThread?.title).toBe("First");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Forum threads", () => {
  it("lists threads by latest activity with paging, and a reply moves a thread up", async () => {
    const result = await withForum({ count: 1 }, ({ players: [me], forum, categoryId }) =>
      Effect.gen(function* () {
        const a = yield* forum.createThread(me!, thread(categoryId, "A"));
        yield* forum.createThread(me!, thread(categoryId, "B"));
        yield* forum.createThread(me!, thread(categoryId, "C"));
        yield* forum.reply(me!, a.id, { body: "Bump" });
        const first = yield* forum.listThreads(me!, { categoryId, limit: 2 });
        const second = yield* forum.listThreads(me!, {
          categoryId,
          limit: 2,
          cursor: first.nextCursor!,
        });
        return { first, second };
      }),
    );
    expect(result.first.items.map((t) => t.title)).toEqual(["A", "C"]);
    expect(result.first.items[0]!.replyCount).toBe(1);
    expect(result.second.items.map((t) => t.title)).toEqual(["B"]);
    expect(result.second.nextCursor).toBeNull();
  });

  it("rejects a cursor it didn't make", async () => {
    const tag = await withForum({ count: 1 }, ({ players, forum, categoryId }) =>
      forum.listThreads(players[0]!, { categoryId, cursor: "nope" }).pipe(Effect.flip),
    );
    expect(tag._tag).toBe("InvalidCursor");
  });

  it("only lets players in the metro read or post in its Local category", async () => {
    const result = await withForum(
      { count: 2, inMetro: [0] },
      ({ players: [local, outsider], forum, localCategoryId }) =>
        Effect.gen(function* () {
          const started = yield* forum.createThread(local!, thread(localCategoryId, "Hit Sunday?"));
          return {
            post: yield* forum
              .createThread(outsider!, thread(localCategoryId, "Me too"))
              .pipe(Effect.flip),
            list: yield* forum
              .listThreads(outsider!, { categoryId: localCategoryId })
              .pipe(Effect.flip),
            read: yield* forum.getThread(outsider!, started.id, {}).pipe(Effect.flip),
            reply: yield* forum.reply(outsider!, started.id, { body: "Hi" }).pipe(Effect.flip),
            mine: yield* forum.listThreads(local!, { categoryId: localCategoryId }),
          };
        }),
    );
    expect(result.post._tag).toBe("ForumCategoryNotFound");
    expect(result.list._tag).toBe("ForumCategoryNotFound");
    expect(result.read._tag).toBe("ForumThreadNotFound");
    expect(result.reply._tag).toBe("ForumThreadNotFound");
    expect(result.mine.items.map((t) => t.title)).toEqual(["Hit Sunday?"]);
  });

  it("limits how many threads a player can start in an hour", async () => {
    const error = await withForum({ count: 1 }, ({ players: [me], forum, categoryId }) =>
      Effect.gen(function* () {
        for (const i of [1, 2, 3, 4, 5]) {
          yield* forum.createThread(me!, thread(categoryId, `T${i}`));
        }
        return yield* forum.createThread(me!, thread(categoryId, "One too many")).pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("ForumRateLimited");
  });

  it("leaves out hidden threads and replies", async () => {
    const result = await withForum(
      { count: 2 },
      ({ players: [me, other], forum, db, categoryId }) =>
        Effect.gen(function* () {
          const shown = yield* forum.createThread(me!, thread(categoryId, "Shown"));
          const hidden = yield* forum.createThread(me!, thread(categoryId, "Hidden"));
          const reply = yield* forum.reply(other!, shown.id, { body: "Hidden reply" });
          yield* db
            .update(forumThread)
            .set({ hiddenAt: new Date() })
            .where(eq(forumThread.id, hidden.id));
          yield* db
            .update(forumPost)
            .set({ hiddenAt: new Date() })
            .where(eq(forumPost.id, reply.id));
          return {
            list: yield* forum.listThreads(other!, { categoryId }),
            read: yield* forum.getThread(other!, hidden.id, {}).pipe(Effect.flip),
            replies: (yield* forum.getThread(me!, shown.id, {})).replies,
          };
        }),
    );
    expect(result.list.items.map((t) => t.title)).toEqual(["Shown"]);
    expect(result.read._tag).toBe("ForumThreadNotFound");
    expect(result.replies).toEqual([]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Forum replies", () => {
  it("returns the thread with its replies oldest first, with paging", async () => {
    const result = await withForum({ count: 2 }, ({ players: [me, sam], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(me!, thread(categoryId, "Strings?"));
        yield* forum.reply(sam!, started.id, { body: "Poly" });
        yield* forum.reply(me!, started.id, { body: "Which one?" });
        yield* forum.reply(sam!, started.id, { body: "RPM Blast" });
        const first = yield* forum.getThread(me!, started.id, { limit: 2 });
        const second = yield* forum.getThread(me!, started.id, {
          limit: 2,
          cursor: first.nextCursor!,
        });
        return { first, second };
      }),
    );
    expect(result.first.thread).toMatchObject({
      title: "Strings?",
      body: "Strings?!",
      replyCount: 3,
      author: { displayName: "Player 0" },
    });
    expect(result.first.replies.map((p) => p.body)).toEqual(["Poly", "Which one?"]);
    expect(result.first.replies[0]!.author).toMatchObject({ displayName: "Player 1" });
    expect(result.second.replies.map((p) => p.body)).toEqual(["RPM Blast"]);
    expect(result.second.nextCursor).toBeNull();
  });

  it("bumps last_post_at and reply_count with each reply", async () => {
    const result = await withForum({ count: 1 }, ({ players: [me], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(me!, thread(categoryId, "Bump"));
        const reply = yield* forum.reply(me!, started.id, { body: "Up" });
        const page = yield* forum.getThread(me!, started.id, {});
        return { started, reply, after: page.thread };
      }),
    );
    expect(result.after.replyCount).toBe(1);
    expect(result.after.lastPostAt).toEqual(result.reply.createdAt);
    expect(result.after.lastPostAt.getTime()).toBeGreaterThanOrEqual(
      result.started.lastPostAt.getTime(),
    );
  });

  it("notifies the thread's author of replies by others", async () => {
    await withForum({ count: 2 }, ({ players: [author, replier], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(author!, thread(categoryId, "Strings"));
        yield* forum.reply(replier!, started.id, { body: "Poly for spin" });
        yield* forum.reply(author!, started.id, { body: "Thanks!" });
        expect(sent.about(`/forum/thread/${started.id}`)).toEqual([
          {
            to: [author!.id],
            from: replier!.id,
            title: `Player 1 replied to "Strings"`,
            body: "Poly for spin",
            url: `/forum/thread/${started.id}`,
          },
        ]);
      }),
    );
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Forum deleting", () => {
  it("lets authors delete replies, which stay as placeholders and drop out of the count", async () => {
    const result = await withForum({ count: 2 }, ({ players: [me, sam], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(me!, thread(categoryId, "Q"));
        const reply = yield* forum.reply(sam!, started.id, { body: "Oops" });
        yield* forum.reply(me!, started.id, { body: "Thanks" });
        const notMine = yield* forum.deletePost(me!, reply.id).pipe(Effect.flip);
        yield* forum.deletePost(sam!, reply.id);
        const again = yield* forum.deletePost(sam!, reply.id).pipe(Effect.flip);
        return { notMine, again, page: yield* forum.getThread(me!, started.id, {}) };
      }),
    );
    expect(result.notMine._tag).toBe("NotForumAuthor");
    expect(result.again._tag).toBe("ForumPostNotFound");
    expect(result.page.thread.replyCount).toBe(1);
    expect(result.page.replies[0]).toMatchObject({ deleted: true, body: null, author: null });
    expect(result.page.replies[1]).toMatchObject({ deleted: false, body: "Thanks" });
  });

  it("lets authors delete threads, which drop out of lists", async () => {
    const result = await withForum({ count: 2 }, ({ players: [me, sam], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(me!, thread(categoryId, "Gone soon"));
        const notMine = yield* forum.deleteThread(sam!, started.id).pipe(Effect.flip);
        yield* forum.deleteThread(me!, started.id);
        return {
          notMine,
          list: yield* forum.listThreads(sam!, { categoryId }),
          read: yield* forum.getThread(sam!, started.id, {}).pipe(Effect.flip),
          reply: yield* forum.reply(sam!, started.id, { body: "Hi" }).pipe(Effect.flip),
        };
      }),
    );
    expect(result.notMine._tag).toBe("NotForumAuthor");
    expect(result.list.items).toEqual([]);
    expect(result.read._tag).toBe("ForumThreadNotFound");
    expect(result.reply._tag).toBe("ForumThreadNotFound");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Forum blocks", () => {
  it("hides threads and replies between blocked players, both ways", async () => {
    const result = await withForum(
      { count: 3 },
      ({ players: [me, blocked, other], forum, db, categoryId }) =>
        Effect.gen(function* () {
          const theirs = yield* forum.createThread(blocked!, thread(categoryId, "Theirs"));
          const mine = yield* forum.createThread(me!, thread(categoryId, "Mine"));
          yield* forum.reply(blocked!, mine.id, { body: "From blocked" });
          yield* forum.reply(other!, mine.id, { body: "From other" });
          yield* db.insert(block).values({ blockerId: blocked!.id, blockedId: me!.id });
          return {
            myList: yield* forum.listThreads(me!, { categoryId }),
            theirList: yield* forum.listThreads(blocked!, { categoryId }),
            read: yield* forum.getThread(me!, theirs.id, {}).pipe(Effect.flip),
            replies: (yield* forum.getThread(me!, mine.id, {})).replies,
            otherSees: (yield* forum.getThread(other!, mine.id, {})).replies,
          };
        }),
    );
    expect(result.myList.items.map((t) => t.title)).toEqual(["Mine"]);
    expect(result.theirList.items.map((t) => t.title)).toEqual(["Theirs"]);
    expect(result.read._tag).toBe("ForumThreadNotFound");
    expect(result.replies.map((p) => p.body)).toEqual(["From other"]);
    expect(result.otherSees.map((p) => p.body)).toEqual(["From blocked", "From other"]);
  });
});

const countsOf = (reactions: ReadonlyArray<{ kind: string; count: number; mine: boolean }>) =>
  Object.fromEntries(reactions.map((r) => [r.kind, [r.count, r.mine]]));

describe.skipIf(!process.env.DATABASE_URL)("Forum reactions", () => {
  it("adds and removes reactions on threads and replies, idempotently", async () => {
    const result = await withForum({ count: 2 }, ({ players: [me, sam], forum, categoryId }) =>
      Effect.gen(function* () {
        const started = yield* forum.createThread(me!, thread(categoryId, "Q"));
        const reply = yield* forum.reply(sam!, started.id, { body: "A" });
        yield* forum.reactToThread(me!, started.id, "like");
        yield* forum.reactToThread(me!, started.id, "like");
        yield* forum.reactToThread(sam!, started.id, "like");
        yield* forum.reactToThread(sam!, started.id, "ace");
        yield* forum.reactToPost(me!, reply.id, "helpful");
        yield* forum.reactToPost(me!, reply.id, "helpful");
        const before = yield* forum.getThread(me!, started.id, {});
        yield* forum.unreactToThread(sam!, started.id, "ace");
        yield* forum.unreactToThread(sam!, started.id, "ace");
        yield* forum.unreactToPost(me!, reply.id, "helpful");
        const after = yield* forum.getThread(me!, started.id, {});
        return { before, after, samView: yield* forum.getThread(sam!, started.id, {}) };
      }),
    );
    expect(result.before.thread.reactions.map((r) => r.kind)).toEqual(["like", "helpful", "ace"]);
    expect(countsOf(result.before.thread.reactions)).toEqual({
      like: [2, true],
      helpful: [0, false],
      ace: [1, false],
    });
    expect(countsOf(result.before.replies[0]!.reactions)).toMatchObject({ helpful: [1, true] });
    expect(countsOf(result.after.thread.reactions)).toMatchObject({ ace: [0, false] });
    expect(countsOf(result.after.replies[0]!.reactions)).toMatchObject({ helpful: [0, false] });
    expect(countsOf(result.samView.thread.reactions)).toMatchObject({ like: [2, true] });
  });

  it("refuses reactions on deleted or hidden content", async () => {
    const result = await withForum({ count: 2 }, ({ players: [me, sam], forum, db, categoryId }) =>
      Effect.gen(function* () {
        const gone = yield* forum.createThread(me!, thread(categoryId, "Gone"));
        const hidden = yield* forum.createThread(me!, thread(categoryId, "Hidden"));
        const live = yield* forum.createThread(me!, thread(categoryId, "Live"));
        const deletedReply = yield* forum.reply(sam!, live.id, { body: "Oops" });
        const hiddenReply = yield* forum.reply(sam!, live.id, { body: "Rude" });
        yield* forum.deleteThread(me!, gone.id);
        yield* forum.deletePost(sam!, deletedReply.id);
        yield* db
          .update(forumThread)
          .set({ hiddenAt: new Date() })
          .where(eq(forumThread.id, hidden.id));
        yield* db
          .update(forumPost)
          .set({ hiddenAt: new Date() })
          .where(eq(forumPost.id, hiddenReply.id));
        return yield* Effect.all([
          forum.reactToThread(sam!, gone.id, "like").pipe(Effect.flip),
          forum.reactToThread(sam!, hidden.id, "like").pipe(Effect.flip),
          forum.reactToPost(me!, deletedReply.id, "like").pipe(Effect.flip),
          forum.reactToPost(me!, hiddenReply.id, "like").pipe(Effect.flip),
        ]);
      }),
    );
    expect(result.map((e) => e._tag)).toEqual([
      "ForumThreadNotFound",
      "ForumThreadNotFound",
      "ForumPostNotFound",
      "ForumPostNotFound",
    ]);
  });

  it("leaves blocked players' reactions out of the counts, both ways", async () => {
    const result = await withForum(
      { count: 3 },
      ({ players: [me, blocked, other], forum, db, categoryId }) =>
        Effect.gen(function* () {
          const started = yield* forum.createThread(other!, thread(categoryId, "Q"));
          const reply = yield* forum.reply(other!, started.id, { body: "A" });
          yield* forum.reactToThread(blocked!, started.id, "like");
          yield* forum.reactToThread(other!, started.id, "like");
          yield* forum.reactToPost(blocked!, reply.id, "ace");
          yield* db.insert(block).values({ blockerId: me!.id, blockedId: blocked!.id });
          return {
            mine: yield* forum.getThread(me!, started.id, {}),
            others: yield* forum.getThread(other!, started.id, {}),
            blockedCanReact: yield* forum
              .reactToPost(blocked!, reply.id, "like")
              .pipe(Effect.as("ok")),
          };
        }),
    );
    expect(countsOf(result.mine.thread.reactions)).toMatchObject({ like: [1, false] });
    expect(countsOf(result.mine.replies[0]!.reactions)).toMatchObject({ ace: [0, false] });
    expect(countsOf(result.others.thread.reactions)).toMatchObject({ like: [2, true] });
    expect(countsOf(result.others.replies[0]!.reactions)).toMatchObject({ ace: [1, false] });
    expect(result.blockedCanReact).toBe("ok");
  });
});
