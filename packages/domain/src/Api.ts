import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api";
import { Authentication } from "./Auth";
import { CannotFollowSelf, FollowLimitReached, FollowedPlayers } from "./Follow";
import {
  HomePointRequired,
  InvalidCursor,
  PlayerId,
  PlayerNotFound,
  PlayerProfile,
  PlayersPage,
  PlayersQuery,
} from "./Player";
import { Availability, Me, ProfilePatch } from "./Profile";
import {
  BlockedPlayer,
  CannotTargetSelf,
  NewReport,
  ReportCreated,
  TargetNotFound,
} from "./Safety";
import {
  InvalidSession,
  NewSession,
  NotSessionHost,
  ProfileRequired,
  Session,
  SessionClosed,
  SessionFull,
  SessionId,
  SessionInvites,
  SessionNotFound,
  SessionPatch,
  SessionsPage,
  SessionsQuery,
} from "./Session";
import {
  CommentNotFound,
  InvalidResult,
  NewSessionComment,
  NewSessionResult,
  NotCommentAuthor,
  NotOnOtherSide,
  NotSessionPlayer,
  ResultConflict,
  ResultNotFound,
  ResultResponse,
  SessionComment,
  SessionCommentId,
  SessionCommentsPage,
  SessionCommentsQuery,
  SessionResult,
} from "./SessionResult";

export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
});
export type Health = typeof Health.Type;

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
) {}

/** The signed-in player's own account, profile and availability. */
export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/me", { success: Me }))
  .add(HttpApiEndpoint.patch("update", "/me", { payload: ProfilePatch, success: Me }))
  .add(
    HttpApiEndpoint.put("replaceAvailability", "/me/availability", {
      payload: Availability,
      success: Availability,
    }),
  )
  /**
   * Records that the signed-in player confirmed they are 18 or older. The app
   * asks once, right after sign-up (or the first social sign-in). Calling it
   * again keeps the first confirmation time.
   */
  .add(HttpApiEndpoint.post("confirmAdult", "/me/adult-confirmation"))
  .middleware(Authentication) {}

/** Finding other players near me and viewing their profiles. */
export class PlayersApi extends HttpApiGroup.make("players")
  /** Players within the radius of my home point, nearest first, cursor-paginated. */
  .add(
    HttpApiEndpoint.get("search", "/players", {
      query: PlayersQuery,
      success: PlayersPage,
      error: [HomePointRequired, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/players/:id", {
      params: { id: PlayerId },
      success: PlayerProfile,
      error: PlayerNotFound,
    }),
  )
  .middleware(Authentication) {}

/**
 * Players I follow for later, so I can find them again without searching.
 * Following is private: the followed player isn't told, and nobody else sees
 * who I follow.
 */
export class FollowsApi extends HttpApiGroup.make("follows")
  .add(HttpApiEndpoint.get("list", "/me/follows", { success: FollowedPlayers }))
  /** Idempotent: following someone I already follow does nothing. */
  .add(
    HttpApiEndpoint.put("follow", "/players/:id/follow", {
      params: { id: PlayerId },
      error: [PlayerNotFound, CannotFollowSelf, FollowLimitReached],
    }),
  )
  /** Idempotent: unfollowing someone I don't follow does nothing. */
  .add(
    HttpApiEndpoint.delete("unfollow", "/players/:id/follow", {
      params: { id: PlayerId },
    }),
  )
  .middleware(Authentication) {}

const PlayerIdParam = { id: PlayerId };

/**
 * Blocking and reporting. Blocked players are hidden from each other
 * everywhere, whoever did the blocking.
 */
export class SafetyApi extends HttpApiGroup.make("safety")
  /** Blocks a player. Blocking someone already blocked is a no-op. */
  .add(
    HttpApiEndpoint.post("block", "/players/:id/block", {
      params: PlayerIdParam,
      error: [TargetNotFound, CannotTargetSelf],
    }),
  )
  /** Unblocks a player. Unblocking someone not blocked is a no-op. */
  .add(HttpApiEndpoint.delete("unblock", "/players/:id/block", { params: PlayerIdParam }))
  /** Players I blocked, most recent first. */
  .add(HttpApiEndpoint.get("listBlocks", "/me/blocks", { success: Schema.Array(BlockedPlayer) }))
  /** Reports a player to the moderators. It doesn't block them; the app offers that next. */
  .add(
    HttpApiEndpoint.post("report", "/reports", {
      payload: NewReport,
      success: ReportCreated.pipe(HttpApiSchema.status(201)),
      error: [TargetNotFound, CannotTargetSelf],
    }),
  )
  .middleware(Authentication) {}

const SessionIdParam = { id: SessionId };

/**
 * Matches and hitting sessions: creating, editing, finding and inviting.
 * Sessions whose host is blocked either way with the viewer never show up.
 */
export class SessionsApi extends HttpApiGroup.make("sessions")
  /** Creates a session with me as host (and its first accepted player). */
  .add(
    HttpApiEndpoint.post("create", "/sessions", {
      payload: NewSession,
      success: Session.pipe(HttpApiSchema.status(201)),
      error: [InvalidSession, ProfileRequired],
    }),
  )
  /** `scope=mine` or `scope=nearby`, cursor-paginated. */
  .add(
    HttpApiEndpoint.get("list", "/sessions", {
      query: SessionsQuery,
      success: SessionsPage,
      error: [HomePointRequired, InvalidCursor],
    }),
  )
  /** Visible to its players, and to others while it is open to them and in their level range. */
  .add(
    HttpApiEndpoint.get("get", "/sessions/:id", {
      params: SessionIdParam,
      success: Session,
      error: SessionNotFound,
    }),
  )
  /** Host only: time, court, level range, spots (hitting), visibility and notes. */
  .add(
    HttpApiEndpoint.patch("update", "/sessions/:id", {
      params: SessionIdParam,
      payload: SessionPatch,
      success: Session,
      error: [SessionNotFound, NotSessionHost, SessionClosed, InvalidSession],
    }),
  )
  /** Host only: invites players. Anyone already in the session is skipped. */
  .add(
    HttpApiEndpoint.post("invite", "/sessions/:id/invites", {
      params: SessionIdParam,
      payload: SessionInvites,
      success: Session,
      error: [
        SessionNotFound,
        NotSessionHost,
        SessionClosed,
        SessionFull,
        PlayerNotFound,
        InvalidSession,
      ],
    }),
  )
  .middleware(Authentication) {}

/**
 * What happens around a session once players are in: logistics comments and,
 * for singles and doubles, the score. Only the host and accepted players can
 * use these. A separate group from `sessions` so each has its own handlers.
 */
export class SessionActivityApi extends HttpApiGroup.make("sessionActivity")
  /** Oldest first, cursor-paginated. Comments by players blocked either way with me are left out. */
  .add(
    HttpApiEndpoint.get("listComments", "/sessions/:id/comments", {
      params: SessionIdParam,
      query: SessionCommentsQuery,
      success: SessionCommentsPage,
      error: [SessionNotFound, NotSessionPlayer, InvalidCursor],
    }),
  )
  /** Not on cancelled sessions. */
  .add(
    HttpApiEndpoint.post("addComment", "/sessions/:id/comments", {
      params: SessionIdParam,
      payload: NewSessionComment,
      success: SessionComment.pipe(HttpApiSchema.status(201)),
      error: [SessionNotFound, NotSessionPlayer, SessionClosed],
    }),
  )
  /** Author only. The comment disappears for everyone. */
  .add(
    HttpApiEndpoint.delete("deleteComment", "/sessions/comments/:commentId", {
      params: { commentId: SessionCommentId },
      error: [CommentNotFound, NotCommentAuthor],
    }),
  )
  /** The session's score, or null when nobody has recorded one. */
  .add(
    HttpApiEndpoint.get("getResult", "/sessions/:id/result", {
      params: SessionIdParam,
      success: Schema.NullOr(SessionResult),
      error: [SessionNotFound, NotSessionPlayer],
    }),
  )
  /**
   * An accepted player records the score of a singles or doubles session
   * after it starts. It waits for the other side to confirm. Replaces a
   * disputed score; fails if one is pending or confirmed.
   */
  .add(
    HttpApiEndpoint.post("recordResult", "/sessions/:id/result", {
      params: SessionIdParam,
      payload: NewSessionResult,
      success: SessionResult.pipe(HttpApiSchema.status(201)),
      error: [SessionNotFound, NotSessionPlayer, SessionClosed, InvalidResult, ResultConflict],
    }),
  )
  /** A player on the other side confirms or disputes a pending score. */
  .add(
    HttpApiEndpoint.post("respondToResult", "/sessions/:id/result/confirm", {
      params: SessionIdParam,
      payload: ResultResponse,
      success: SessionResult,
      error: [SessionNotFound, NotSessionPlayer, ResultNotFound, NotOnOtherSide, ResultConflict],
    }),
  )
  .middleware(Authentication) {}

/** The whole Love All API. Shared by the server and the mobile client. */
export class Api extends HttpApi.make("love-all")
  .add(SystemApi)
  .add(MeApi)
  .add(PlayersApi)
  .add(FollowsApi)
  .add(SafetyApi)
  .add(SessionsApi)
  .add(SessionActivityApi)
  .annotateMerge(OpenApi.annotations({ title: "Love All API" })) {}
