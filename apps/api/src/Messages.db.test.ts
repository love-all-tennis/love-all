import { CONVERSATIONS_PER_HOUR, SessionUser } from "@love-all/domain";
import { eq, inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { conversation, profile, report, user } from "./db/schema";
import { Forum } from "./Forum";
import { Messages } from "./Messages";
import { Safety } from "./Safety";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const sent = makeNotificationsMemory();

const TestLayer = Layer.mergeAll(
  Messages.layer,
  Safety.layer.pipe(Layer.provide(Forum.layer)),
).pipe(Layer.provide(sent.layer), Layer.provideMerge(Db.layer));

interface World {
  readonly players: ReadonlyArray<SessionUser>;
  readonly messages: Messages["Service"];
  readonly safety: Safety["Service"];
  readonly db: Db["Service"];
}

const withPlayers = <A, E>(
  setup: { readonly count: number; readonly withoutProfile?: ReadonlyArray<number> },
  f: (world: World) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const messages = yield* Messages;
    const safety = yield* Safety;

    const players = Array.from({ length: setup.count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;

      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });

    const ids = players.map((p) => p.id);
    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));

    return yield* Effect.gen(function* () {
      const withProfile = players.filter((_, i) => !setup.withoutProfile?.includes(i));

      if (withProfile.length > 0) {
        yield* db
          .insert(profile)
          .values(withProfile.map((p) => ({ userId: p.id, displayName: `Player ${p.name}` })));
      }

      return yield* f({ players, messages, safety, db });
    }).pipe(
      Effect.ensuring(
        Effect.orDie(
          Effect.all([
            db.delete(report).where(inArray(report.reporterId, ids)),
            db.delete(user).where(inArray(user.id, ids)),
          ]),
        ),
      ),
    );
  }).pipe(Effect.provide(TestLayer), Effect.runPromise);

const say = (body: string) => ({ body });

describe.skipIf(!process.env.DATABASE_URL)("Opening conversations", () => {
  it("gives a pair one conversation, whoever opens it", async () => {
    const result = await withPlayers({ count: 2 }, ({ players: [a, b], messages }) =>
      Effect.gen(function* () {
        const first = yield* messages.openConversation(a!, b!.id);
        const again = yield* messages.openConversation(a!, b!.id);
        const fromB = yield* messages.openConversation(b!, a!.id);

        return { first, again, fromB, a: a!, b: b! };
      }),
    );

    expect(result.again.id).toBe(result.first.id);
    expect(result.fromB.id).toBe(result.first.id);
    expect(result.first.otherPlayer).toMatchObject({ id: result.b.id, displayName: "Player P1" });
    expect(result.fromB.otherPlayer.id).toBe(result.a.id);
    expect(result.first.lastMessage).toBeNull();
    expect(result.first.unreadCount).toBe(0);
  });

  it("refuses myself, players without a profile, blocked players, and me without a profile", async () => {
    const result = await withPlayers(
      { count: 4, withoutProfile: [2, 3] },
      ({ players: [a, b, noProfile, newcomer], messages, safety }) =>
        Effect.gen(function* () {
          const self = yield* Effect.flip(messages.openConversation(a!, a!.id));
          const missing = yield* Effect.flip(messages.openConversation(a!, noProfile!.id));
          const needsProfile = yield* Effect.flip(messages.openConversation(newcomer!, a!.id));
          yield* safety.block(b!, a!.id);
          const blocked = yield* Effect.flip(messages.openConversation(a!, b!.id));

          return { self, missing, needsProfile, blocked };
        }),
    );

    expect(result.self._tag).toBe("CannotMessageSelf");
    expect(result.missing._tag).toBe("PlayerNotFound");
    expect(result.needsProfile._tag).toBe("ProfileRequired");
    expect(result.blocked._tag).toBe("PlayerNotFound");
  });

  it("limits new conversations an hour", async () => {
    const error = await withPlayers(
      { count: CONVERSATIONS_PER_HOUR + 2 },
      ({ players: [me, ...others], messages }) =>
        Effect.gen(function* () {
          for (const other of others.slice(0, CONVERSATIONS_PER_HOUR)) {
            yield* messages.openConversation(me!, other.id);
          }

          yield* messages.openConversation(me!, others[0]!.id);

          return yield* Effect.flip(messages.openConversation(me!, others.at(-1)!.id));
        }),
    );

    expect(error._tag).toBe("MessagesRateLimited");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Sending and reading", () => {
  it("lists only conversations with messages, latest first, with the last message", async () => {
    const result = await withPlayers({ count: 4 }, ({ players: [me, b, c, d], messages }) =>
      Effect.gen(function* () {
        const withB = yield* messages.openConversation(me!, b!.id);
        const withC = yield* messages.openConversation(me!, c!.id);
        yield* messages.openConversation(me!, d!.id);
        yield* messages.send(me!, withB.id, say("Hit Saturday?"));
        yield* messages.send(c!, withC.id, say("Doubles at 6?"));
        yield* messages.send(b!, withB.id, say("Sure, 9am"));

        return { inbox: yield* messages.listConversations(me!, {}), withB, withC };
      }),
    );

    expect(result.inbox.items.map((c) => c.id)).toEqual([result.withB.id, result.withC.id]);
    expect(result.inbox.items[0]!.lastMessage).toMatchObject({ body: "Sure, 9am", mine: false });
    expect(result.inbox.items[0]!.unreadCount).toBe(1);
    expect(result.inbox.items[1]!.unreadCount).toBe(1);
    expect(result.inbox.unreadConversations).toBe(2);
  });

  it("counts unread messages until I read them or reply", async () => {
    const result = await withPlayers({ count: 3 }, ({ players: [me, b, c], messages }) =>
      Effect.gen(function* () {
        const withB = yield* messages.openConversation(b!, me!.id);
        const withC = yield* messages.openConversation(c!, me!.id);
        yield* messages.send(b!, withB.id, say("One"));
        yield* messages.send(b!, withB.id, say("Two"));
        yield* messages.send(c!, withC.id, say("Hi"));
        const before = yield* messages.listConversations(me!, {});
        yield* messages.markRead(me!, withB.id);
        yield* messages.send(me!, withC.id, say("Hey"));
        const after = yield* messages.listConversations(me!, {});
        const theirs = yield* messages.listConversations(b!, {});

        return { before, after, theirs };
      }),
    );

    expect(result.before.items.map((c) => c.unreadCount)).toEqual([1, 2]);
    expect(result.before.unreadConversations).toBe(2);
    expect(result.after.items.map((c) => c.unreadCount)).toEqual([0, 0]);
    expect(result.after.unreadConversations).toBe(0);
    expect(result.theirs.items[0]!.unreadCount).toBe(0);
  });

  it("pages messages newest first and the inbox latest first", async () => {
    const result = await withPlayers({ count: 4 }, ({ players: [me, b, c, d], messages }) =>
      Effect.gen(function* () {
        const convo = yield* messages.openConversation(me!, b!.id);

        for (const n of [1, 2, 3, 4, 5]) {
          yield* messages.send(n % 2 ? me! : b!, convo.id, say(`m${n}`));
        }

        const first = yield* messages.listMessages(me!, convo.id, { limit: 2 });

        const second = yield* messages.listMessages(me!, convo.id, {
          limit: 2,
          cursor: first.nextCursor!,
        });

        const third = yield* messages.listMessages(me!, convo.id, {
          limit: 2,
          cursor: second.nextCursor!,
        });

        for (const other of [c!, d!]) {
          const next = yield* messages.openConversation(me!, other.id);
          yield* messages.send(me!, next.id, say("hello"));
        }

        const inbox1 = yield* messages.listConversations(me!, { limit: 2 });

        const inbox2 = yield* messages.listConversations(me!, {
          limit: 2,
          cursor: inbox1.nextCursor!,
        });

        return { first, second, third, inbox1, inbox2, convo };
      }),
    );

    const bodies = (page: typeof result.first) => page.items.map((m) => m.body);
    expect(bodies(result.first)).toEqual(["m5", "m4"]);
    expect(bodies(result.second)).toEqual(["m3", "m2"]);
    expect(bodies(result.third)).toEqual(["m1"]);
    expect(result.third.nextCursor).toBeNull();
    expect(result.first.items.map((m) => m.mine)).toEqual([true, false]);
    expect(result.first.conversation.id).toBe(result.convo.id);
    expect(result.inbox1.items).toHaveLength(2);
    expect(result.inbox2.items.map((c) => c.id)).toEqual([result.convo.id]);
    expect(result.inbox2.nextCursor).toBeNull();
  });

  it("keeps other players out of a conversation", async () => {
    const result = await withPlayers({ count: 3 }, ({ players: [a, b, outsider], messages }) =>
      Effect.gen(function* () {
        const convo = yield* messages.openConversation(a!, b!.id);

        return yield* Effect.all({
          read: Effect.flip(messages.listMessages(outsider!, convo.id, {})),
          send: Effect.flip(messages.send(outsider!, convo.id, say("hi"))),
          mark: Effect.flip(messages.markRead(outsider!, convo.id)),
          bogus: Effect.flip(messages.listMessages(a!, "not-a-uuid", {})),
          cursor: Effect.flip(messages.listMessages(a!, convo.id, { cursor: "nope" })),
        });
      }),
    );

    expect(result.read._tag).toBe("ConversationNotFound");
    expect(result.send._tag).toBe("ConversationNotFound");
    expect(result.mark._tag).toBe("ConversationNotFound");
    expect(result.bogus._tag).toBe("ConversationNotFound");
    expect(result.cursor._tag).toBe("InvalidCursor");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Blocking and reporting", () => {
  it("ends the conversation for both sides when either blocks, and unblocking brings it back", async () => {
    const result = await withPlayers({ count: 2 }, ({ players: [a, b], messages, safety, db }) =>
      Effect.gen(function* () {
        const convo = yield* messages.openConversation(a!, b!.id);
        yield* messages.send(a!, convo.id, say("See you at 6"));
        yield* safety.block(b!, a!.id);

        const blocked = yield* Effect.all({
          inboxA: messages.listConversations(a!, {}),
          inboxB: messages.listConversations(b!, {}),
          readA: Effect.flip(messages.listMessages(a!, convo.id, {})),
          sendA: Effect.flip(messages.send(a!, convo.id, say("hello?"))),
          sendB: Effect.flip(messages.send(b!, convo.id, say("bye"))),
        });

        const [kept] = yield* db
          .select({ id: conversation.id })
          .from(conversation)
          .where(eq(conversation.id, convo.id));

        yield* safety.unblock(b!, a!.id);
        const unblocked = yield* messages.listConversations(a!, {});

        return { blocked, kept, unblocked };
      }),
    );

    expect(result.blocked.inboxA.items).toHaveLength(0);
    expect(result.blocked.inboxB.items).toHaveLength(0);
    expect(result.blocked.inboxB.unreadConversations).toBe(0);
    expect(result.blocked.readA._tag).toBe("ConversationNotFound");
    expect(result.blocked.sendA._tag).toBe("ConversationNotFound");
    expect(result.blocked.sendB._tag).toBe("ConversationNotFound");
    expect(result.kept).toBeDefined();
    expect(result.unblocked.items).toHaveLength(1);
  });

  it("lets me report the other player's message, even after blocking them", async () => {
    const result = await withPlayers(
      { count: 3 },
      ({ players: [me, them, outsider], messages, safety, db }) =>
        Effect.gen(function* () {
          const convo = yield* messages.openConversation(them!, me!.id);
          const theirs = yield* messages.send(them!, convo.id, say("rude message"));
          const mine = yield* messages.send(me!, convo.id, say("please stop"));
          yield* safety.block(me!, them!.id);

          const created = yield* safety.report(me!, {
            targetType: "direct_message",
            targetId: theirs.id,
            reason: "harassment",
          });

          const [row] = yield* db.select().from(report).where(eq(report.id, created.id));

          const own = yield* Effect.flip(
            safety.report(me!, { targetType: "direct_message", targetId: mine.id, reason: "spam" }),
          );

          const notMine = yield* Effect.flip(
            safety.report(outsider!, {
              targetType: "direct_message",
              targetId: theirs.id,
              reason: "spam",
            }),
          );

          const bogus = yield* Effect.flip(
            safety.report(me!, { targetType: "direct_message", targetId: "x", reason: "spam" }),
          );

          return { row, own, notMine, bogus, theirs };
        }),
    );

    expect(result.row).toMatchObject({
      targetType: "direct_message",
      targetId: result.theirs.id,
      subjectId: result.theirs.senderId,
      content: "rude message",
      reason: "harassment",
      status: "open",
    });
    expect(result.own._tag).toBe("CannotTargetSelf");
    expect(result.notMine._tag).toBe("TargetNotFound");
    expect(result.bogus._tag).toBe("TargetNotFound");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("Message notifications", () => {
  it("tells the other player about a new message, by name, and never the sender", async () => {
    const result = await withPlayers({ count: 2 }, ({ players: [a, b], messages }) =>
      Effect.gen(function* () {
        const convo = yield* messages.openConversation(a!, b!.id);
        yield* messages.send(a!, convo.id, say("Court 3 at 6?"));

        return { convo, a: a!, b: b! };
      }),
    );

    const notices = sent.about(`/messages/${result.convo.id}`);
    expect(notices).toEqual([
      {
        to: [result.b.id],
        from: result.a.id,
        title: "Player P0",
        body: "Court 3 at 6?",
        url: `/messages/${result.convo.id}`,
      },
    ]);
  });
});
