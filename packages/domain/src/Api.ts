import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api";
import { Authentication } from "./Auth";
import {
  Club,
  ClubAlreadyExists,
  ClubId,
  ClubNotFound,
  ClubRateLimited,
  ClubReview,
  ClubReviewInput,
  ClubReviewsPage,
  ClubReviewsQuery,
  ClubSummary,
  ClubsQuery,
  NewClub,
} from "./Club";
import { NewDevice, PushToken } from "./Device";
import {
  EquipmentDetail,
  EquipmentExists,
  EquipmentId,
  EquipmentNotFound,
  EquipmentPage,
  EquipmentQuery,
  EquipmentRateLimited,
  EquipmentReview,
  EquipmentReviewInput,
  EquipmentReviewsPage,
  EquipmentReviewsQuery,
  NewEquipment,
} from "./Equipment";
import {
  ForumCategory,
  ForumCategoryNotFound,
  ForumPost,
  ForumPostId,
  ForumPostNotFound,
  ForumRateLimited,
  ForumReactionKind,
  ForumRepliesQuery,
  ForumThread,
  ForumThreadId,
  ForumThreadNotFound,
  ForumThreadPage,
  ForumThreadsPage,
  ForumThreadsQuery,
  NewForumPost,
  NewForumThread,
  NotForumAuthor,
} from "./Forum";
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
import {
  HideableTargetType,
  ModerationReportsPage,
  ModerationReportsQuery,
  NewSuspension,
  NotModerator,
  ReportId,
  ReportNotFound,
} from "./Moderation";
import {
  CannotMessageSelf,
  Conversation,
  ConversationId,
  ConversationNotFound,
  ConversationsPage,
  ConversationsQuery,
  DirectMessage,
  MessagesPage,
  MessagesQuery,
  MessagesRateLimited,
  NewConversation,
  NewDirectMessage,
} from "./Message";
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
import { JoinRequestNotFound, LevelOutOfRange, NotInvited, SessionResponse } from "./SessionJoin";
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
  .add(HttpApiEndpoint.post("confirmAdult", "/me/adult-confirmation"))
  .middleware(Authentication) {}

/** Finding other players near me and viewing their profiles. */
export class PlayersApi extends HttpApiGroup.make("players")
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
  .add(
    HttpApiEndpoint.put("follow", "/players/:id/follow", {
      params: { id: PlayerId },
      error: [PlayerNotFound, CannotFollowSelf, FollowLimitReached],
    }),
  )
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
  .add(
    HttpApiEndpoint.post("block", "/players/:id/block", {
      params: PlayerIdParam,
      error: [TargetNotFound, CannotTargetSelf],
    }),
  )
  .add(HttpApiEndpoint.delete("unblock", "/players/:id/block", { params: PlayerIdParam }))
  .add(HttpApiEndpoint.get("listBlocks", "/me/blocks", { success: Schema.Array(BlockedPlayer) }))
  .add(
    HttpApiEndpoint.post("report", "/reports", {
      payload: NewReport,
      success: ReportCreated.pipe(HttpApiSchema.status(201)),
      error: [TargetNotFound, CannotTargetSelf],
    }),
  )
  .middleware(Authentication) {}

const SessionIdParam = { id: SessionId };
const SessionPlayerParams = { id: SessionId, userId: PlayerId };

/**
 * Matches and hitting sessions: creating, editing, finding, inviting, and
 * joining and leaving.
 * Sessions whose host is blocked either way with the viewer never show up.
 */
export class SessionsApi extends HttpApiGroup.make("sessions")
  .add(
    HttpApiEndpoint.post("create", "/sessions", {
      payload: NewSession,
      success: Session.pipe(HttpApiSchema.status(201)),
      error: [InvalidSession, ProfileRequired],
    }),
  )
  .add(
    HttpApiEndpoint.get("list", "/sessions", {
      query: SessionsQuery,
      success: SessionsPage,
      error: [HomePointRequired, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/sessions/:id", {
      params: SessionIdParam,
      success: Session,
      error: SessionNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.patch("update", "/sessions/:id", {
      params: SessionIdParam,
      payload: SessionPatch,
      success: Session,
      error: [SessionNotFound, NotSessionHost, SessionClosed, InvalidSession],
    }),
  )
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
  .add(
    HttpApiEndpoint.post("respond", "/sessions/:id/respond", {
      params: SessionIdParam,
      payload: SessionResponse,
      error: [
        SessionNotFound,
        SessionClosed,
        SessionFull,
        NotInvited,
        LevelOutOfRange,
        ProfileRequired,
      ],
    }),
  )
  .add(
    HttpApiEndpoint.post("approve", "/sessions/:id/approve/:userId", {
      params: SessionPlayerParams,
      error: [SessionNotFound, NotSessionHost, SessionClosed, SessionFull, JoinRequestNotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("reject", "/sessions/:id/reject/:userId", {
      params: SessionPlayerParams,
      error: [SessionNotFound, NotSessionHost, JoinRequestNotFound],
    }),
  )
  .add(
    HttpApiEndpoint.post("leave", "/sessions/:id/leave", {
      params: SessionIdParam,
      error: [SessionNotFound, SessionClosed, NotInvited, InvalidSession],
    }),
  )
  .add(
    HttpApiEndpoint.post("cancel", "/sessions/:id/cancel", {
      params: SessionIdParam,
      error: [SessionNotFound, NotSessionHost, SessionClosed],
    }),
  )
  .middleware(Authentication) {}

/**
 * What happens around a session once players are in: logistics comments and,
 * for singles and doubles, the score. Only the host and accepted players can
 * use these. A separate group from `sessions` so each has its own handlers.
 */
export class SessionActivityApi extends HttpApiGroup.make("sessionActivity")
  .add(
    HttpApiEndpoint.get("listComments", "/sessions/:id/comments", {
      params: SessionIdParam,
      query: SessionCommentsQuery,
      success: SessionCommentsPage,
      error: [SessionNotFound, NotSessionPlayer, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.post("addComment", "/sessions/:id/comments", {
      params: SessionIdParam,
      payload: NewSessionComment,
      success: SessionComment.pipe(HttpApiSchema.status(201)),
      error: [SessionNotFound, NotSessionPlayer, SessionClosed],
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteComment", "/sessions/comments/:commentId", {
      params: { commentId: SessionCommentId },
      error: [CommentNotFound, NotCommentAuthor],
    }),
  )
  .add(
    HttpApiEndpoint.get("getResult", "/sessions/:id/result", {
      params: SessionIdParam,
      success: Schema.NullOr(SessionResult),
      error: [SessionNotFound, NotSessionPlayer],
    }),
  )
  .add(
    HttpApiEndpoint.post("recordResult", "/sessions/:id/result", {
      params: SessionIdParam,
      payload: NewSessionResult,
      success: SessionResult.pipe(HttpApiSchema.status(201)),
      error: [SessionNotFound, NotSessionPlayer, SessionClosed, InvalidResult, ResultConflict],
    }),
  )
  .add(
    HttpApiEndpoint.post("respondToResult", "/sessions/:id/result/confirm", {
      params: SessionIdParam,
      payload: ResultResponse,
      success: SessionResult,
      error: [SessionNotFound, NotSessionPlayer, ResultNotFound, NotOnOtherSide, ResultConflict],
    }),
  )
  .middleware(Authentication) {}

const ForumThreadParam = { id: ForumThreadId };
const ForumPostParam = { id: ForumPostId };
const ThreadReactionParams = { id: ForumThreadId, kind: ForumReactionKind };
const PostReactionParams = { id: ForumPostId, kind: ForumReactionKind };

/**
 * The forum: global categories plus the Local category for my metro.
 * Threads and replies by players blocked either way with me are left out,
 * and so is anything a moderator hid.
 */
export class ForumApi extends HttpApiGroup.make("forum")
  .add(
    HttpApiEndpoint.get("listCategories", "/forum/categories", {
      success: Schema.Array(ForumCategory),
    }),
  )
  .add(
    HttpApiEndpoint.get("listThreads", "/forum/threads", {
      query: ForumThreadsQuery,
      success: ForumThreadsPage,
      error: [ForumCategoryNotFound, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.post("createThread", "/forum/threads", {
      payload: NewForumThread,
      success: ForumThread.pipe(HttpApiSchema.status(201)),
      error: [ForumCategoryNotFound, ForumRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.get("getThread", "/forum/threads/:id", {
      params: ForumThreadParam,
      query: ForumRepliesQuery,
      success: ForumThreadPage,
      error: [ForumThreadNotFound, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.post("reply", "/forum/threads/:id/posts", {
      params: ForumThreadParam,
      payload: NewForumPost,
      success: ForumPost.pipe(HttpApiSchema.status(201)),
      error: [ForumThreadNotFound, ForumRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteThread", "/forum/threads/:id", {
      params: ForumThreadParam,
      error: [ForumThreadNotFound, NotForumAuthor],
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePost", "/forum/posts/:id", {
      params: ForumPostParam,
      error: [ForumPostNotFound, NotForumAuthor],
    }),
  )
  .add(
    HttpApiEndpoint.put("reactToThread", "/forum/threads/:id/reactions/:kind", {
      params: ThreadReactionParams,
      error: ForumThreadNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.delete("unreactToThread", "/forum/threads/:id/reactions/:kind", {
      params: ThreadReactionParams,
    }),
  )
  .add(
    HttpApiEndpoint.put("reactToPost", "/forum/posts/:id/reactions/:kind", {
      params: PostReactionParams,
      error: ForumPostNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.delete("unreactToPost", "/forum/posts/:id/reactions/:kind", {
      params: PostReactionParams,
    }),
  )
  .middleware(Authentication) {}

const HiddenContentParams = { type: HideableTargetType, id: Schema.String };

/**
 * Moderation, for admins only: everyone else gets `NotModerator`. Hiding and
 * suspending are idempotent, and each closes the open reports it answers.
 */
export class ModerationApi extends HttpApiGroup.make("moderation")
  .add(
    HttpApiEndpoint.get("listReports", "/moderation/reports", {
      query: ModerationReportsQuery,
      success: ModerationReportsPage,
      error: [NotModerator, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.post("dismissReport", "/moderation/reports/:id/dismiss", {
      params: { id: ReportId },
      error: [NotModerator, ReportNotFound],
    }),
  )
  .add(
    HttpApiEndpoint.put("hideContent", "/moderation/content/:type/:id/hidden", {
      params: HiddenContentParams,
      error: [NotModerator, TargetNotFound],
    }),
  )
  .add(
    HttpApiEndpoint.delete("unhideContent", "/moderation/content/:type/:id/hidden", {
      params: HiddenContentParams,
      error: [NotModerator, TargetNotFound],
    }),
  )
  .add(
    HttpApiEndpoint.put("suspend", "/moderation/players/:id/suspension", {
      params: PlayerIdParam,
      payload: NewSuspension,
      error: [NotModerator, TargetNotFound, CannotTargetSelf],
    }),
  )
  .add(
    HttpApiEndpoint.delete("unsuspend", "/moderation/players/:id/suspension", {
      params: PlayerIdParam,
      error: [NotModerator, TargetNotFound],
    }),
  )
  .middleware(Authentication) {}

/**
 * This phone's push token, so the API can send it notifications. The app
 * registers it after signing in and removes it before signing out.
 */
export class DevicesApi extends HttpApiGroup.make("devices")
  .add(HttpApiEndpoint.post("register", "/devices", { payload: NewDevice }))
  .add(HttpApiEndpoint.delete("unregister", "/devices/:token", { params: { token: PushToken } }))
  .middleware(Authentication) {}

const ConversationParam = { id: ConversationId };

/**
 * Direct messages: async one-to-one conversations. Only the two players in a
 * conversation can see it, and a block either way ends it for both.
 */
export class MessagesApi extends HttpApiGroup.make("messages")
  .add(
    HttpApiEndpoint.get("listConversations", "/conversations", {
      query: ConversationsQuery,
      success: ConversationsPage,
      error: InvalidCursor,
    }),
  )
  .add(
    HttpApiEndpoint.post("openConversation", "/conversations", {
      payload: NewConversation,
      success: Conversation,
      error: [PlayerNotFound, CannotMessageSelf, ProfileRequired, MessagesRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.get("listMessages", "/conversations/:id/messages", {
      params: ConversationParam,
      query: MessagesQuery,
      success: MessagesPage,
      error: [ConversationNotFound, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.post("send", "/conversations/:id/messages", {
      params: ConversationParam,
      payload: NewDirectMessage,
      success: DirectMessage.pipe(HttpApiSchema.status(201)),
      error: [ConversationNotFound, MessagesRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.post("markRead", "/conversations/:id/read", {
      params: ConversationParam,
      error: ConversationNotFound,
    }),
  )
  .middleware(Authentication) {}

const EquipmentIdParam = { id: EquipmentId };

/**
 * Equipment reviews: a shared catalog of gear that any player can add to,
 * and one review per player per item. Reviews by players blocked either way
 * with me are left out, and don't count toward the ratings I see.
 */
export class EquipmentApi extends HttpApiGroup.make("equipment")
  .add(
    HttpApiEndpoint.get("list", "/equipment", {
      query: EquipmentQuery,
      success: EquipmentPage,
      error: InvalidCursor,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/equipment", {
      payload: NewEquipment,
      success: EquipmentDetail.pipe(HttpApiSchema.status(201)),
      error: [EquipmentExists, EquipmentRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/equipment/:id", {
      params: EquipmentIdParam,
      success: EquipmentDetail,
      error: EquipmentNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.get("listReviews", "/equipment/:id/reviews", {
      params: EquipmentIdParam,
      query: EquipmentReviewsQuery,
      success: EquipmentReviewsPage,
      error: [EquipmentNotFound, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.put("saveReview", "/equipment/:id/review", {
      params: EquipmentIdParam,
      payload: EquipmentReviewInput,
      success: EquipmentReview,
      error: EquipmentNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deleteReview", "/equipment/:id/review", {
      params: EquipmentIdParam,
    }),
  )
  .middleware(Authentication) {}

const ClubParam = { id: ClubId };

/**
 * Clubs and their reviews. Anyone can add a club; each player reviews a club
 * once and can change or remove their review. Reviews by players blocked
 * either way with me are left out, of lists and of the star counts.
 */
export class ClubsApi extends HttpApiGroup.make("clubs")
  .add(
    HttpApiEndpoint.get("list", "/clubs", {
      query: ClubsQuery,
      success: Schema.Array(ClubSummary),
      error: HomePointRequired,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/clubs", {
      payload: NewClub,
      success: Club.pipe(HttpApiSchema.status(201)),
      error: [ClubAlreadyExists, ClubRateLimited],
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/clubs/:id", {
      params: ClubParam,
      success: Club,
      error: ClubNotFound,
    }),
  )
  .add(
    HttpApiEndpoint.get("listReviews", "/clubs/:id/reviews", {
      params: ClubParam,
      query: ClubReviewsQuery,
      success: ClubReviewsPage,
      error: [ClubNotFound, InvalidCursor],
    }),
  )
  .add(
    HttpApiEndpoint.put("saveReview", "/clubs/:id/review", {
      params: ClubParam,
      payload: ClubReviewInput,
      success: ClubReview,
      error: ClubNotFound,
    }),
  )
  .add(HttpApiEndpoint.delete("deleteReview", "/clubs/:id/review", { params: ClubParam }))
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
  .add(ForumApi)
  .add(ModerationApi)
  .add(DevicesApi)
  .add(MessagesApi)
  .add(EquipmentApi)
  .add(ClubsApi)
  .annotateMerge(OpenApi.annotations({ title: "Love All API" })) {}
