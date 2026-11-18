import { Effect } from "effect";

import { callApi, type ApiClient } from "@/lib/api";
import type { JoinChange } from "./joining";

const errorCopy = {
  SessionFull: "Someone just took the last spot.",
  SessionClosed: "This session was cancelled or has already started.",
  SessionNotFound: "This session is no longer available.",
  NotSessionHost: "Only the host can do that.",
  JoinRequestNotFound: "That request was withdrawn or already answered.",
  ProfileRequired: "Finish your profile before you join a session.",
} as const;

type Endpoint = "respond" | "leave" | "cancel" | "approve" | "reject";

type Sent = Effect.Effect<void, Effect.Error<ReturnType<ApiClient["sessions"][Endpoint]>>>;

const send: (api: ApiClient, id: string, change: JoinChange) => Sent = (api, id, change) => {
  switch (change.kind) {
    case "accept":
    case "decline":
    case "request":
      return api.sessions.respond({ params: { id }, payload: { answer: change.kind } });
    case "leave":
      return api.sessions.leave({ params: { id } });
    case "cancel":
      return api.sessions.cancel({ params: { id } });
    case "approve":
      return api.sessions.approve({ params: { id, userId: change.userId } });
    case "reject":
      return api.sessions.reject({ params: { id, userId: change.userId } });
  }
};

const own = (e: { readonly message: string }) => Effect.succeed(e.message);
const copy = (tag: keyof typeof errorCopy) => () => Effect.succeed(errorCopy[tag]);

/**
 * Sends a join change for session `id`. Resolves to a message to show when the
 * server said no for a reason the player can understand, otherwise null.
 * Other failures (no connection, a server error) reject.
 */
export const sendJoinChange = (id: string, change: JoinChange) =>
  callApi((api) =>
    send(api, id, change).pipe(
      Effect.as<string | null>(null),
      Effect.catchTags({
        SessionFull: copy("SessionFull"),
        SessionClosed: copy("SessionClosed"),
        SessionNotFound: copy("SessionNotFound"),
        NotSessionHost: copy("NotSessionHost"),
        JoinRequestNotFound: copy("JoinRequestNotFound"),
        ProfileRequired: copy("ProfileRequired"),
        NotInvited: own,
        LevelOutOfRange: own,
        InvalidSession: own,
      }),
    ),
  );
