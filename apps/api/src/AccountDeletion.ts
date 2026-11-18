import { Role, SessionUser } from "@love-all/domain";
import { and, eq, gt, inArray, ne } from "drizzle-orm";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { AppleTokens } from "./AppleTokens";
import { Db } from "./Db";
import { account, playSession, playSessionParticipant, user } from "./db/schema";
import { SessionJoins } from "./SessionJoins";

const isRole = Schema.is(Role);

const skipped = { log: "Warn", message: "Couldn't leave a session" } as const;

const appleTokenOf = (row: {
  readonly refreshToken: string | null;
  readonly accessToken: string | null;
}) =>
  Option.fromNullishOr(row.refreshToken).pipe(
    Option.map((value) => ({ value, kind: "refresh_token" as const })),
    Option.orElse(() =>
      Option.fromNullishOr(row.accessToken).pipe(
        Option.map((value) => ({ value, kind: "access_token" as const })),
      ),
    ),
  );

/**
 * What happens to a player's things when they delete their account.
 *
 * Postgres does most of it when Better Auth deletes the `user` row. Every
 * table that points at a player either cascades or goes null:
 * - Deleted: their profile, availability, follows, blocks, push tokens,
 *   their places in sessions, session comments, forum reactions,
 *   conversations and messages, and club and gear reviews.
 * - Kept for other players, with the player set to null so it shows as
 *   "Deleted account": forum threads and replies, sessions they hosted,
 *   scores they recorded, clubs and gear they added, and reports they filed
 *   or that are about them.
 *
 * `prepare` runs first, for what a cascade can't do on its own:
 * - Upcoming sessions they host are cancelled, so the other players hear
 *   about it, and they give up their spot in other upcoming sessions, so the
 *   host hears and the spot reopens.
 * - Their Sign in with Apple tokens are revoked, as Apple requires. A failed
 *   revoke is logged and doesn't stop the deletion.
 *
 * Database failures are defects, which stop the deletion (a 500).
 */
export class AccountDeletion extends Context.Service<
  AccountDeletion,
  {
    readonly prepare: (userId: string) => Effect.Effect<void>;
  }
>()("love-all/AccountDeletion") {
  static readonly layer = Layer.effect(
    AccountDeletion,
    Effect.gen(function* () {
      const db = yield* Db;
      const joins = yield* SessionJoins;
      const apple = yield* AppleTokens;

      const leaveUpcomingSessions = (player: SessionUser) =>
        Effect.gen(function* () {
          const upcoming = yield* db
            .select({ id: playSession.id, hostId: playSession.hostId })
            .from(playSessionParticipant)
            .innerJoin(playSession, eq(playSession.id, playSessionParticipant.sessionId))
            .where(
              and(
                eq(playSessionParticipant.userId, player.id),
                inArray(playSessionParticipant.state, ["accepted", "requested"]),
                ne(playSession.status, "cancelled"),
                gt(playSession.startsAt, new Date()),
              ),
            )
            .pipe(Effect.orDie);

          yield* Effect.forEach(
            upcoming,
            (session) =>
              session.hostId === player.id
                ? Effect.ignore(joins.cancel(player, session.id), skipped)
                : Effect.ignore(joins.leave(player, session.id), skipped),
            { discard: true },
          );
        });

      const revokeApple = (player: SessionUser) =>
        Effect.gen(function* () {
          const accounts = yield* db
            .select({ refreshToken: account.refreshToken, accessToken: account.accessToken })
            .from(account)
            .where(and(eq(account.userId, player.id), eq(account.providerId, "apple")))
            .pipe(Effect.orDie);

          yield* Effect.forEach(
            accounts,
            (row) =>
              Option.match(appleTokenOf(row), {
                onNone: () => Effect.void,
                onSome: apple.revoke,
              }),
            { discard: true },
          ).pipe(Effect.ignore({ log: "Warn", message: "Couldn't revoke the Apple token" }));
        });

      return AccountDeletion.of({
        prepare: (userId) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .select({ id: user.id, name: user.name, email: user.email, role: user.role })
              .from(user)
              .where(eq(user.id, userId))
              .pipe(Effect.orDie);

            if (!row) {
              return;
            }

            const player = new SessionUser({
              ...row,
              role: isRole(row.role) ? row.role : "player",
            });

            yield* leaveUpcomingSessions(player);
            yield* revokeApple(player);
          }).pipe(Effect.withSpan("AccountDeletion.prepare")),
      });
    }),
  );
}
