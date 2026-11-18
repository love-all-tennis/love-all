import { Api, CurrentUser } from "@love-all/domain";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { Accounts } from "./Accounts";
import { Clubs } from "./Clubs";
import { Db } from "./Db";
import { Equipment } from "./Equipment";
import { Follows } from "./Follows";
import { Forum } from "./Forum";
import { Messages } from "./Messages";
import { Moderation } from "./Moderation";
import { Notifications } from "./Notifications";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { SessionActivity } from "./SessionActivity";
import { Sessions } from "./Sessions";
import { SessionJoins } from "./SessionJoins";

export const SystemHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function* (handlers) {
    const db = yield* Db;
    return handlers.handle("health", () =>
      db.execute(sql`select 1`).pipe(Effect.as({ status: "ok" as const }), Effect.orDie),
    );
  }),
);

export const MeHandlers = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts;
    const profiles = yield* Profiles;
    return handlers
      .handle("get", () => Effect.flatMap(CurrentUser, profiles.get))
      .handle("update", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => profiles.update(user, payload)),
      )
      .handle("replaceAvailability", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => profiles.replaceAvailability(user, payload)),
      )
      .handle("confirmAdult", () =>
        Effect.flatMap(CurrentUser, (user) => accounts.confirmAdult(user.id)),
      );
  }),
);

export const FollowsHandlers = HttpApiBuilder.group(
  Api,
  "follows",
  Effect.fn(function* (handlers) {
    const follows = yield* Follows;
    return handlers
      .handle("list", () => Effect.flatMap(CurrentUser, follows.list))
      .handle("follow", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => follows.follow(user, params.id)),
      )
      .handle("unfollow", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => follows.unfollow(user, params.id)),
      );
  }),
);

export const PlayersHandlers = HttpApiBuilder.group(
  Api,
  "players",
  Effect.fn(function* (handlers) {
    const players = yield* Players;
    return handlers
      .handle("search", ({ query }) =>
        Effect.flatMap(CurrentUser, (viewer) => players.search(viewer, query)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (viewer) => players.get(viewer, params.id)),
      );
  }),
);

export const SafetyHandlers = HttpApiBuilder.group(
  Api,
  "safety",
  Effect.fn(function* (handlers) {
    const safety = yield* Safety;
    return handlers
      .handle("block", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => safety.block(user, params.id)),
      )
      .handle("unblock", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => safety.unblock(user, params.id)),
      )
      .handle("listBlocks", () => Effect.flatMap(CurrentUser, safety.listBlocks))
      .handle("report", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => safety.report(user, payload)),
      );
  }),
);

export const SessionsHandlers = HttpApiBuilder.group(
  Api,
  "sessions",
  Effect.fn(function* (handlers) {
    const sessions = yield* Sessions;
    const joins = yield* SessionJoins;
    return handlers
      .handle("create", ({ payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.create(viewer, payload)),
      )
      .handle("list", ({ query }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.list(viewer, query)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.get(viewer, params.id)),
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.update(viewer, params.id, payload)),
      )
      .handle("invite", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (viewer) => sessions.invite(viewer, params.id, payload)),
      )
      .handle("respond", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => joins.respond(user, params.id, payload.answer)),
      )
      .handle("approve", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.approve(user, params.id, params.userId)),
      )
      .handle("reject", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.reject(user, params.id, params.userId)),
      )
      .handle("leave", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.leave(user, params.id)),
      )
      .handle("cancel", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => joins.cancel(user, params.id)),
      );
  }),
);

export const SessionActivityHandlers = HttpApiBuilder.group(
  Api,
  "sessionActivity",
  Effect.fn(function* (handlers) {
    const activity = yield* SessionActivity;
    return handlers
      .handle("listComments", ({ params, query }) =>
        Effect.flatMap(CurrentUser, (user) => activity.listComments(user, params.id, query)),
      )
      .handle("addComment", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => activity.addComment(user, params.id, payload)),
      )
      .handle("deleteComment", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => activity.deleteComment(user, params.commentId)),
      )
      .handle("getResult", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => activity.getResult(user, params.id)),
      )
      .handle("recordResult", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => activity.recordResult(user, params.id, payload)),
      )
      .handle("respondToResult", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => activity.respondToResult(user, params.id, payload)),
      );
  }),
);

export const ForumHandlers = HttpApiBuilder.group(
  Api,
  "forum",
  Effect.fn(function* (handlers) {
    const forum = yield* Forum;
    return handlers
      .handle("listCategories", () => Effect.flatMap(CurrentUser, forum.listCategories))
      .handle("listThreads", ({ query }) =>
        Effect.flatMap(CurrentUser, (user) => forum.listThreads(user, query)),
      )
      .handle("createThread", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => forum.createThread(user, payload)),
      )
      .handle("getThread", ({ params, query }) =>
        Effect.flatMap(CurrentUser, (user) => forum.getThread(user, params.id, query)),
      )
      .handle("reply", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => forum.reply(user, params.id, payload)),
      )
      .handle("deleteThread", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.deleteThread(user, params.id)),
      )
      .handle("deletePost", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.deletePost(user, params.id)),
      )
      .handle("reactToThread", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.reactToThread(user, params.id, params.kind)),
      )
      .handle("unreactToThread", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.unreactToThread(user, params.id, params.kind)),
      )
      .handle("reactToPost", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.reactToPost(user, params.id, params.kind)),
      )
      .handle("unreactToPost", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => forum.unreactToPost(user, params.id, params.kind)),
      );
  }),
);

export const ModerationHandlers = HttpApiBuilder.group(
  Api,
  "moderation",
  Effect.fn(function* (handlers) {
    const moderation = yield* Moderation;
    return handlers
      .handle("listReports", ({ query }) =>
        Effect.flatMap(CurrentUser, (user) => moderation.listReports(user, query)),
      )
      .handle("dismissReport", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => moderation.dismissReport(user, params.id)),
      )
      .handle("hideContent", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => moderation.hideContent(user, params.type, params.id)),
      )
      .handle("unhideContent", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) =>
          moderation.unhideContent(user, params.type, params.id),
        ),
      )
      .handle("suspend", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => moderation.suspend(user, params.id, payload)),
      )
      .handle("unsuspend", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => moderation.unsuspend(user, params.id)),
      );
  }),
);

export const DevicesHandlers = HttpApiBuilder.group(
  Api,
  "devices",
  Effect.fn(function* (handlers) {
    const notifications = yield* Notifications;
    return handlers
      .handle("register", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => notifications.register(user, payload)),
      )
      .handle("unregister", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => notifications.unregister(user, params.token)),
      );
  }),
);

export const MessagesHandlers = HttpApiBuilder.group(
  Api,
  "messages",
  Effect.fn(function* (handlers) {
    const messages = yield* Messages;
    return handlers
      .handle("listConversations", ({ query }) =>
        Effect.flatMap(CurrentUser, (user) => messages.listConversations(user, query)),
      )
      .handle("openConversation", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => messages.openConversation(user, payload.playerId)),
      )
      .handle("listMessages", ({ params, query }) =>
        Effect.flatMap(CurrentUser, (user) => messages.listMessages(user, params.id, query)),
      )
      .handle("send", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => messages.send(user, params.id, payload)),
      )
      .handle("markRead", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => messages.markRead(user, params.id)),
      );
  }),
);

export const EquipmentHandlers = HttpApiBuilder.group(
  Api,
  "equipment",
  Effect.fn(function* (handlers) {
    const gear = yield* Equipment;
    return handlers
      .handle("list", ({ query }) => Effect.flatMap(CurrentUser, (user) => gear.list(user, query)))
      .handle("create", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => gear.create(user, payload)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => gear.get(user, params.id)),
      )
      .handle("listReviews", ({ params, query }) =>
        Effect.flatMap(CurrentUser, (user) => gear.listReviews(user, params.id, query)),
      )
      .handle("saveReview", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => gear.saveReview(user, params.id, payload)),
      )
      .handle("deleteReview", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => gear.deleteReview(user, params.id)),
      );
  }),
);

export const ClubsHandlers = HttpApiBuilder.group(
  Api,
  "clubs",
  Effect.fn(function* (handlers) {
    const clubs = yield* Clubs;
    return handlers
      .handle("list", ({ query }) => Effect.flatMap(CurrentUser, (user) => clubs.list(user, query)))
      .handle("create", ({ payload }) =>
        Effect.flatMap(CurrentUser, (user) => clubs.create(user, payload)),
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => clubs.get(user, params.id)),
      )
      .handle("listReviews", ({ params, query }) =>
        Effect.flatMap(CurrentUser, (user) => clubs.listReviews(user, params.id, query)),
      )
      .handle("saveReview", ({ params, payload }) =>
        Effect.flatMap(CurrentUser, (user) => clubs.saveReview(user, params.id, payload)),
      )
      .handle("deleteReview", ({ params }) =>
        Effect.flatMap(CurrentUser, (user) => clubs.deleteReview(user, params.id)),
      );
  }),
);

export const ApiHandlers = Layer.mergeAll(
  SystemHandlers,
  MeHandlers,
  PlayersHandlers,
  FollowsHandlers,
  SafetyHandlers,
  SessionsHandlers,
  SessionActivityHandlers,
  ForumHandlers,
  ModerationHandlers,
  DevicesHandlers,
  MessagesHandlers,
  EquipmentHandlers,
  ClubsHandlers,
);
