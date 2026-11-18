import { sql } from "drizzle-orm";
import { Context, Effect, Layer, Schedule } from "effect";
import { Db } from "./Db";
import { playSession, playSessionParticipant } from "./db/schema";
import { Notifications } from "./Notifications";
import { messages } from "./notifications/messages";

/** How long before a session starts its players get the "starting soon" push. */
export const REMINDER_LEAD_MINUTES = 60;

const CHECK_EVERY = "1 minute";

/**
 * "Starting soon" pushes. Once a session is within `REMINDER_LEAD_MINUTES`
 * of starting, every accepted player (host included) gets one, as long as it
 * isn't cancelled and at least two players are in. Each session is reminded
 * once: `reminder_sent_at` is claimed in the same statement that finds it, so
 * two API instances never both send. Moving the start time clears it.
 */
export class SessionReminders extends Context.Service<
  SessionReminders,
  {
    /** Sends every reminder that is due now. Succeeds with how many sessions were reminded. */
    readonly sendDue: Effect.Effect<number>;
  }
>()("love-all/SessionReminders") {
  static readonly layer = Layer.effect(
    SessionReminders,
    Effect.gen(function* () {
      const db = yield* Db;
      const notifications = yield* Notifications;

      const sendDue = Effect.gen(function* () {
        const due = yield* db
          .update(playSession)
          .set({ reminderSentAt: sql`now()` })
          .where(
            sql`${playSession.reminderSentAt} is null
              and ${playSession.status} <> 'cancelled'
              and ${playSession.startsAt} > now()
              and ${playSession.startsAt} <= now() + make_interval(mins => ${REMINDER_LEAD_MINUTES})
              and (
                select count(*) from ${playSessionParticipant}
                where ${playSessionParticipant.sessionId} = ${playSession.id}
                  and ${playSessionParticipant.state} = 'accepted'
              ) >= 2`,
          )
          .returning({
            id: playSession.id,
            kind: playSession.kind,
            startsAt: playSession.startsAt,
            courtName: playSession.courtName,
            players: sql<Array<string>>`array(
              select ${playSessionParticipant.userId} from ${playSessionParticipant}
              where ${playSessionParticipant.sessionId} = ${playSession.id}
                and ${playSessionParticipant.state} = 'accepted'
            )`,
          });
        for (const session of due) {
          yield* notifications.notify({
            to: session.players,
            ...messages.reminder(session),
          });
        }
        return due.length;
      }).pipe(Effect.orDie, Effect.withSpan("SessionReminders.sendDue"));

      return SessionReminders.of({ sendDue });
    }),
  );

  /** Checks for due reminders every minute while the server runs. A failed check is logged. */
  static readonly schedule = Layer.effectDiscard(
    Effect.gen(function* () {
      const reminders = yield* SessionReminders;
      yield* reminders.sendDue.pipe(
        Effect.catchCause((cause) => Effect.logError("Sending session reminders failed", cause)),
        Effect.repeat(Schedule.spaced(CHECK_EVERY)),
        Effect.forkScoped,
      );
    }),
  );
}
