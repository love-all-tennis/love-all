import type { NewDevice, SessionUser } from "@love-all/domain";
import { and, eq, inArray, ne } from "drizzle-orm";
import { Context, Effect, FiberSet, Layer } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { pushToken } from "./db/schema";
import { type PushMessage, PushSender } from "./PushSender";

/** A notification for some players. */
export interface Notice {
  /** Account ids. Duplicates are sent once. */
  readonly to: ReadonlyArray<string>;
  /**
   * The player whose action caused it. They're never notified themselves,
   * and nobody blocked either way with them is.
   */
  readonly from?: string;
  readonly title: string;
  readonly body: string;
  /** The app route a tap opens, such as `/sessions/<id>`. */
  readonly url: string;
}

/**
 * Push tokens and sending notifications to players' phones.
 *
 * `notify` is fire and forget: it returns at once and sends in the
 * background, and a failure is logged, never passed to the caller. Call it
 * after the change it reports is committed. Tokens Expo says are no longer
 * registered (the app was deleted) are removed.
 *
 * Database failures in `register` and `unregister` are defects (a 500).
 */
export class Notifications extends Context.Service<
  Notifications,
  {
    readonly register: (user: SessionUser, device: NewDevice) => Effect.Effect<void>;
    readonly unregister: (user: SessionUser, token: string) => Effect.Effect<void>;
    readonly notify: (notice: Notice) => Effect.Effect<void>;
    /** Waits for notifications in flight. For tests. */
    readonly flush: Effect.Effect<void>;
  }
>()("love-all/Notifications") {
  static readonly layer = Layer.effect(
    Notifications,
    Effect.gen(function* () {
      const db = yield* Db;
      const sender = yield* PushSender;
      const inFlight = yield* FiberSet.make();

      const register = (user: SessionUser, device: NewDevice) =>
        db
          .insert(pushToken)
          .values({ token: device.token, userId: user.id, platform: device.platform })
          .onConflictDoUpdate({
            target: pushToken.token,
            set: { userId: user.id, platform: device.platform, updatedAt: new Date() },
          })
          .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Notifications.register"));

      const unregister = (user: SessionUser, token: string) =>
        db
          .delete(pushToken)
          .where(and(eq(pushToken.token, token), eq(pushToken.userId, user.id)))
          .pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Notifications.unregister"));

      const send = (notice: Notice) =>
        Effect.gen(function* () {
          const to = [...new Set(notice.to)];
          if (to.length === 0) {
            return;
          }
          const { from } = notice;
          const tokens = yield* db
            .select({ token: pushToken.token })
            .from(pushToken)
            .where(
              and(
                inArray(pushToken.userId, to),
                from === undefined ? undefined : ne(pushToken.userId, from),
                from === undefined ? undefined : notBlocked(from, pushToken.userId),
              ),
            );
          if (tokens.length === 0) {
            return;
          }

          const messages: Array<PushMessage> = tokens.map(({ token }) => ({
            to: token,
            title: notice.title,
            body: notice.body,
            data: { url: notice.url },
          }));
          const tickets = yield* sender.send(messages);
          const gone = tickets.flatMap((ticket, i) =>
            ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
              ? [messages[i]!.to]
              : [],
          );
          if (gone.length > 0) {
            yield* db.delete(pushToken).where(inArray(pushToken.token, gone));
          }
          const failed =
            tickets.length - gone.length - tickets.filter((t) => t.status === "ok").length;
          if (failed > 0) {
            yield* Effect.logWarning(`Expo rejected ${failed} push messages`, tickets);
          }
        }).pipe(
          Effect.catchCause((cause) => Effect.logError("Sending a notification failed", cause)),
          Effect.withSpan("Notifications.send"),
        );

      return Notifications.of({
        register,
        unregister,
        notify: (notice) => FiberSet.run(inFlight, send(notice)).pipe(Effect.asVoid),
        flush: FiberSet.awaitEmpty(inFlight),
      });
    }),
  );
}
