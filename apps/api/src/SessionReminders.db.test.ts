import { SessionUser } from "@love-all/domain";
import { inArray } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Db } from "./Db";
import { playSession, playSessionParticipant, user } from "./db/schema";
import { SessionReminders } from "./SessionReminders";
import { makeNotificationsMemory } from "./testing/NotificationsMemory";

const sent = makeNotificationsMemory();

const TestLayer = SessionReminders.layer.pipe(
  Layer.provide(sent.layer),
  Layer.provideMerge(Db.layer),
);

const withPlayers = <A, E>(
  count: number,
  f: (
    players: ReadonlyArray<SessionUser>,
    services: { db: Db["Service"]; reminders: SessionReminders["Service"] },
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const reminders = yield* SessionReminders;

    const players = Array.from({ length: count }, (_, i) => {
      const id = `test_${crypto.randomUUID()}`;

      return new SessionUser({ id, name: `P${i}`, email: `${id}@example.com`, role: "player" });
    });

    yield* db.insert(user).values(players.map(({ id, name, email }) => ({ id, name, email })));

    return yield* f(players, { db, reminders }).pipe(
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

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

const makeSession = (
  db: Db["Service"],
  host: SessionUser,
  others: ReadonlyArray<SessionUser>,
  options: { startsAt: Date; status?: "open" | "confirmed" | "cancelled" },
) =>
  Effect.gen(function* () {
    const [row] = yield* db
      .insert(playSession)
      .values({
        hostId: host.id,
        kind: "singles",
        startsAt: options.startsAt,
        durationMinutes: 90,
        courtName: "Palmer Park",
        spots: 2,
        visibility: "invite_only",
        status: options.status ?? "open",
      })
      .returning({ id: playSession.id });

    yield* db
      .insert(playSessionParticipant)
      .values([
        { sessionId: row!.id, userId: host.id, role: "host", state: "accepted" },
        ...others.map((p) => ({ sessionId: row!.id, userId: p.id, state: "accepted" as const })),
      ]);

    return row!.id;
  });

describe.skipIf(!process.env.DATABASE_URL)("SessionReminders", () => {
  it("reminds every accepted player once, within the hour before the start", async () => {
    await withPlayers(2, ([host, guest], { db, reminders }) =>
      Effect.gen(function* () {
        const due = yield* makeSession(db, host!, [guest!], {
          startsAt: minutesFromNow(30),
          status: "confirmed",
        });

        const alone = yield* makeSession(db, host!, [], { startsAt: minutesFromNow(30) });

        const cancelled = yield* makeSession(db, host!, [guest!], {
          startsAt: minutesFromNow(30),
          status: "cancelled",
        });

        const later = yield* makeSession(db, host!, [guest!], { startsAt: minutesFromNow(180) });
        const started = yield* makeSession(db, host!, [guest!], { startsAt: minutesFromNow(-5) });

        yield* reminders.sendDue;
        yield* reminders.sendDue;

        const notices = sent.about(`/sessions/${due}`);
        expect(notices).toHaveLength(1);
        expect([...notices[0]!.to].sort()).toEqual([host!.id, guest!.id].sort());
        expect(notices[0]!.title).toMatch(/^Singles at \d{1,2}:\d{2} [AP]M$/);
        expect(notices[0]!.body).toBe("Starting soon at Palmer Park");

        for (const id of [alone, cancelled, later, started]) {
          expect(sent.about(`/sessions/${id}`)).toEqual([]);
        }
      }),
    );
  });
});
