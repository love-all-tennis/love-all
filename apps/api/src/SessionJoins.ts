import {
  InvalidSession,
  JoinRequestNotFound,
  LevelOutOfRange,
  NotInvited,
  NotSessionHost,
  ProfileRequired,
  SessionClosed,
  type SessionAnswer,
  SessionFull,
  SessionNotFound,
  type SessionUser,
} from "@love-all/domain";
import { and, count, eq, inArray, ne, or, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { Db } from "./Db";
import { notBlocked } from "./db/blocks";
import { playSession, playSessionParticipant, profile } from "./db/schema";
import { type Notice, Notifications } from "./Notifications";
import { messages } from "./notifications/messages";
import { playerName } from "./notifications/names";

/** A transaction handle, as `db.transaction` passes it. */
export type Tx = Parameters<Parameters<Db["Service"]["transaction"]>[0]>[0];

type DbError = { readonly _tag: "SqlError" | "EffectDrizzleQueryError" };

const dieOnDbError = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.catchIf(
      (error): error is Extract<E, DbError> =>
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        (error._tag === "SqlError" || error._tag === "EffectDrizzleQueryError"),
      (error) => Effect.die(error),
    ),
  );

const acceptedCount = (tx: Tx, sessionId: string) =>
  tx
    .select({ total: count() })
    .from(playSessionParticipant)
    .where(
      and(
        eq(playSessionParticipant.sessionId, sessionId),
        eq(playSessionParticipant.state, "accepted"),
      ),
    )
    .pipe(Effect.map(([row]) => row?.total ?? 0));

const lockSession = (tx: Tx, sessionId: string) =>
  tx
    .select({
      id: playSession.id,
      hostId: playSession.hostId,
      kind: playSession.kind,
      courtName: playSession.courtName,
      spots: playSession.spots,
      status: playSession.status,
      visibility: playSession.visibility,
      startsAt: playSession.startsAt,
      levelMin: playSession.levelMin,
      levelMax: playSession.levelMax,
    })
    .from(playSession)
    .where(eq(playSession.id, sessionId))
    .for("update")
    .pipe(Effect.map(([row]) => row));

type LockedSession = NonNullable<Effect.Success<ReturnType<typeof lockSession>>>;

const requireOpenForChanges = (session: LockedSession) =>
  session.status === "cancelled"
    ? Effect.fail(new SessionClosed({ message: "This session was cancelled" }))
    : session.startsAt.getTime() <= Date.now()
      ? Effect.fail(new SessionClosed({ message: "This session has already started" }))
      : Effect.void;

const participantOf = (tx: Tx, sessionId: string, userId: string) =>
  tx
    .select({ role: playSessionParticipant.role, state: playSessionParticipant.state })
    .from(playSessionParticipant)
    .where(
      and(
        eq(playSessionParticipant.sessionId, sessionId),
        eq(playSessionParticipant.userId, userId),
      ),
    )
    .pipe(Effect.map(([row]) => row));

const setState = (
  tx: Tx,
  sessionId: string,
  userId: string,
  state: "accepted" | "declined" | "left",
) =>
  tx
    .update(playSessionParticipant)
    .set({ state })
    .where(
      and(
        eq(playSessionParticipant.sessionId, sessionId),
        eq(playSessionParticipant.userId, userId),
      ),
    );

const takeSpot = (tx: Tx, session: LockedSession, userId: string) =>
  Effect.gen(function* () {
    const taken = yield* acceptedCount(tx, session.id);
    if (taken >= session.spots) {
      return yield* new SessionFull({ message: "Every spot is taken" });
    }
    yield* setState(tx, session.id, userId, "accepted");
    if (taken + 1 < session.spots) return false;
    yield* tx
      .update(playSession)
      .set({ status: "confirmed" })
      .where(eq(playSession.id, session.id));
    yield* tx
      .update(playSessionParticipant)
      .set({ state: "declined" })
      .where(
        and(
          eq(playSessionParticipant.sessionId, session.id),
          eq(playSessionParticipant.state, "requested"),
        ),
      );
    return true;
  });

const playersIn = (
  tx: Tx,
  sessionId: string,
  states: ReadonlyArray<"invited" | "requested" | "accepted">,
) =>
  tx
    .select({ userId: playSessionParticipant.userId })
    .from(playSessionParticipant)
    .where(
      and(
        eq(playSessionParticipant.sessionId, sessionId),
        inArray(playSessionParticipant.state, states),
      ),
    )
    .pipe(Effect.map((rows) => rows.map((row) => row.userId)));

const confirmedNotices = (tx: Tx, session: LockedSession, userId: string, confirmed: boolean) =>
  confirmed
    ? playersIn(tx, session.id, ["accepted"]).pipe(
        Effect.map(
          (ids) =>
            [
              { to: ids.filter((id) => id !== userId), ...messages.confirmed(session) },
            ] satisfies ReadonlyArray<Notice>,
        ),
      )
    : Effect.succeed<ReadonlyArray<Notice>>([]);

const reopenIfSpotFree = (tx: Tx, sessionId: string) =>
  tx
    .update(playSession)
    .set({ status: "open" })
    .where(
      and(
        eq(playSession.id, sessionId),
        eq(playSession.status, "confirmed"),
        sql`${playSession.spots} > (
          select count(*) from ${playSessionParticipant}
          where ${playSessionParticipant.sessionId} = ${playSession.id}
            and ${playSessionParticipant.state} = 'accepted'
        )`,
      ),
    );

/**
 * Takes the other player out of every session one of the two hosts, so a
 * block also ends any session plans between them. Sessions that lose an
 * accepted player go back to `open`. Run it inside the block's transaction.
 */
export const removeFromEachOthersSessions = (tx: Tx, a: string, b: string) =>
  Effect.gen(function* () {
    const removed = yield* tx
      .delete(playSessionParticipant)
      .where(
        and(
          ne(playSessionParticipant.role, "host"),
          or(
            and(
              eq(playSessionParticipant.userId, b),
              sql`${playSessionParticipant.sessionId} in (select ${playSession.id} from ${playSession} where ${playSession.hostId} = ${a})`,
            ),
            and(
              eq(playSessionParticipant.userId, a),
              sql`${playSessionParticipant.sessionId} in (select ${playSession.id} from ${playSession} where ${playSession.hostId} = ${b})`,
            ),
          ),
        ),
      )
      .returning({ sessionId: playSessionParticipant.sessionId });
    for (const { sessionId } of removed) {
      yield* reopenIfSpotFree(tx, sessionId);
    }
  });

const ntrpOf = (tx: Tx, userId: string) =>
  tx
    .select({ ntrp: profile.ntrp })
    .from(profile)
    .where(eq(profile.userId, userId))
    .pipe(Effect.map(([row]) => row));

const strangerCanSee = (session: LockedSession, ntrp: string | null) =>
  session.visibility === "open" && session.status !== "cancelled" && inLevelRange(session, ntrp);

const inLevelRange = (session: LockedSession, ntrp: string | null) =>
  (session.levelMin === null || (ntrp !== null && ntrp >= session.levelMin)) &&
  (session.levelMax === null || (ntrp !== null && ntrp <= session.levelMax));

/**
 * Joining, leaving and cancelling sessions. Each change locks the session
 * row first and counts spots inside the same transaction.
 *
 * Sessions whose host is blocked either way with the player look missing
 * (`SessionNotFound`), the same as in `GET /sessions/:id`. Database failures
 * are defects (a 500).
 */
export class SessionJoins extends Context.Service<
  SessionJoins,
  {
    readonly respond: (
      user: SessionUser,
      sessionId: string,
      answer: SessionAnswer,
    ) => Effect.Effect<
      void,
      SessionNotFound | SessionClosed | SessionFull | NotInvited | LevelOutOfRange | ProfileRequired
    >;
    readonly approve: (
      host: SessionUser,
      sessionId: string,
      userId: string,
    ) => Effect.Effect<
      void,
      SessionNotFound | NotSessionHost | SessionClosed | SessionFull | JoinRequestNotFound
    >;
    readonly reject: (
      host: SessionUser,
      sessionId: string,
      userId: string,
    ) => Effect.Effect<void, SessionNotFound | NotSessionHost | JoinRequestNotFound>;
    readonly leave: (
      user: SessionUser,
      sessionId: string,
    ) => Effect.Effect<void, SessionNotFound | SessionClosed | NotInvited | InvalidSession>;
    readonly cancel: (
      host: SessionUser,
      sessionId: string,
    ) => Effect.Effect<void, SessionNotFound | NotSessionHost | SessionClosed>;
  }
>()("love-all/SessionJoins") {
  static readonly layer = Layer.effect(
    SessionJoins,
    Effect.gen(function* () {
      const db = yield* Db;
      const notifications = yield* Notifications;

      const withSession = <E>(
        viewer: SessionUser,
        sessionId: string,
        f: (
          tx: Tx,
          session: LockedSession,
        ) => Effect.Effect<ReadonlyArray<Notice> | void, E, never>,
      ) =>
        db
          .transaction((tx) =>
            Effect.gen(function* () {
              const session = yield* lockSession(tx, sessionId);
              if (!session) return yield* new SessionNotFound({ id: sessionId });
              if (session.hostId !== viewer.id) {
                const [visible] = yield* tx
                  .select({ ok: sql<boolean>`true` })
                  .from(playSession)
                  .where(
                    and(eq(playSession.id, sessionId), notBlocked(viewer.id, playSession.hostId)),
                  );
                if (!visible) return yield* new SessionNotFound({ id: sessionId });
              }
              return yield* f(tx, session);
            }),
          )
          .pipe(
            dieOnDbError,
            Effect.tap((notices) =>
              Effect.forEach(notices ?? [], (notice) => notifications.notify(notice), {
                discard: true,
              }),
            ),
          );

      const asHost = <E>(
        host: SessionUser,
        sessionId: string,
        verb: string,
        f: (
          tx: Tx,
          session: LockedSession,
        ) => Effect.Effect<ReadonlyArray<Notice> | void, E, never>,
      ) =>
        withSession(host, sessionId, (tx, session) => {
          const step: Effect.Effect<ReadonlyArray<Notice> | void, E | NotSessionHost> =
            session.hostId === host.id
              ? f(tx, session)
              : Effect.fail(new NotSessionHost({ message: `Only the host can ${verb}` }));
          return step;
        });

      const respond = (user: SessionUser, sessionId: string, answer: SessionAnswer) =>
        withSession(user, sessionId, (tx, session) =>
          Effect.gen(function* () {
            const me = yield* participantOf(tx, sessionId, user.id);
            const mine = yield* ntrpOf(tx, user.id);
            if (!me && !strangerCanSee(session, mine?.ntrp ?? null)) {
              return yield* new SessionNotFound({ id: sessionId });
            }
            yield* requireOpenForChanges(session);
            if (me?.state === "accepted") return;

            if (answer === "decline") {
              if (me?.state !== "invited") {
                return yield* new NotInvited({ message: "You have no invite to decline" });
              }
              yield* setState(tx, sessionId, user.id, "declined");
              const name = yield* playerName(tx, user.id);
              return [
                { to: [session.hostId], from: user.id, ...messages.declinedInvite(session, name) },
              ];
            }

            if (me?.state === "invited") {
              const confirmed = yield* takeSpot(tx, session, user.id);
              if (confirmed) return yield* confirmedNotices(tx, session, user.id, true);
              const name = yield* playerName(tx, user.id);
              return [
                { to: [session.hostId], from: user.id, ...messages.acceptedInvite(session, name) },
              ];
            }
            if (answer === "accept") {
              return yield* new NotInvited({ message: "You have no invite to accept" });
            }

            if (me?.state === "requested") return;
            if (session.visibility === "invite_only") {
              return yield* new NotInvited({ message: "This session is invite only" });
            }
            if (me?.state === "declined") {
              return yield* new NotInvited({ message: "You can't ask to join this session again" });
            }
            if (session.status === "confirmed") {
              return yield* new SessionFull({ message: "Every spot is taken" });
            }
            if (!mine) {
              return yield* new ProfileRequired({
                message: "Set up your profile so the host can see who is asking",
              });
            }
            if (!inLevelRange(session, mine.ntrp)) {
              return yield* new LevelOutOfRange({
                message: "Your level is outside this session's range",
              });
            }
            yield* tx
              .insert(playSessionParticipant)
              .values({ sessionId, userId: user.id, role: "player", state: "requested" })
              .onConflictDoUpdate({
                target: [playSessionParticipant.sessionId, playSessionParticipant.userId],
                set: { state: "requested" },
              });
            const name = yield* playerName(tx, user.id);
            return [
              { to: [session.hostId], from: user.id, ...messages.askedToJoin(session, name) },
            ];
          }),
        ).pipe(Effect.asVoid, Effect.withSpan("SessionJoins.respond"));

      const pendingRequest = (tx: Tx, session: LockedSession, userId: string) =>
        Effect.gen(function* () {
          const [row] = yield* tx
            .select({ userId: playSessionParticipant.userId })
            .from(playSessionParticipant)
            .where(
              and(
                eq(playSessionParticipant.sessionId, session.id),
                eq(playSessionParticipant.userId, userId),
                eq(playSessionParticipant.state, "requested"),
                notBlocked(session.hostId, playSessionParticipant.userId),
              ),
            );
          if (!row) return yield* new JoinRequestNotFound({ userId });
        });

      const approve = (host: SessionUser, sessionId: string, userId: string) =>
        asHost(host, sessionId, "approve players", (tx, session) =>
          Effect.gen(function* () {
            yield* requireOpenForChanges(session);
            yield* pendingRequest(tx, session, userId);
            const confirmed = yield* takeSpot(tx, session, userId);
            const hostName = yield* playerName(tx, host.id);
            const others = yield* confirmedNotices(tx, session, userId, confirmed);
            return [
              { to: [userId], from: host.id, ...messages.approved(session, hostName) },
              ...others,
            ];
          }),
        ).pipe(Effect.asVoid, Effect.withSpan("SessionJoins.approve"));

      const reject = (host: SessionUser, sessionId: string, userId: string) =>
        asHost(host, sessionId, "turn down players", (tx, session) =>
          Effect.gen(function* () {
            yield* pendingRequest(tx, session, userId);
            yield* setState(tx, sessionId, userId, "declined");
            const hostName = yield* playerName(tx, host.id);
            return [{ to: [userId], from: host.id, ...messages.notApproved(session, hostName) }];
          }),
        ).pipe(Effect.asVoid, Effect.withSpan("SessionJoins.reject"));

      const leave = (user: SessionUser, sessionId: string) =>
        withSession(user, sessionId, (tx, session) =>
          Effect.gen(function* () {
            if (session.hostId === user.id) {
              return yield* new InvalidSession({
                message: "The host can't leave; cancel the session instead",
              });
            }
            const me = yield* participantOf(tx, sessionId, user.id);
            if (!me) {
              const mine = yield* ntrpOf(tx, user.id);
              if (!strangerCanSee(session, mine?.ntrp ?? null)) {
                return yield* new SessionNotFound({ id: sessionId });
              }
            }
            yield* requireOpenForChanges(session);
            if (me?.state !== "accepted" && me?.state !== "requested") {
              return yield* new NotInvited({ message: "You're not in this session" });
            }
            yield* setState(tx, sessionId, user.id, "left");
            if (me.state !== "accepted") return;
            yield* reopenIfSpotFree(tx, sessionId);
            const name = yield* playerName(tx, user.id);
            return [{ to: [session.hostId], from: user.id, ...messages.left(session, name) }];
          }),
        ).pipe(Effect.asVoid, Effect.withSpan("SessionJoins.leave"));

      const cancel = (host: SessionUser, sessionId: string) =>
        asHost(host, sessionId, "cancel the session", (tx, session) =>
          Effect.gen(function* () {
            if (session.status === "cancelled") return;
            yield* requireOpenForChanges(session);
            yield* tx
              .update(playSession)
              .set({ status: "cancelled" })
              .where(eq(playSession.id, sessionId));
            const players = yield* playersIn(tx, sessionId, ["invited", "requested", "accepted"]);
            const hostName = yield* playerName(tx, host.id);
            return [
              {
                to: players.filter((id) => id !== host.id),
                from: host.id,
                ...messages.cancelled(session, hostName),
              },
            ];
          }),
        ).pipe(Effect.asVoid, Effect.withSpan("SessionJoins.cancel"));

      return SessionJoins.of({ respond, approve, reject, leave, cancel });
    }),
  );
}
