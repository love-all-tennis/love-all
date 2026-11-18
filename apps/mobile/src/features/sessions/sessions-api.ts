import type {
  NewSession,
  Session,
  SessionPatch,
  SessionScope,
  SessionsPage,
  SessionsQuery,
} from "@love-all/domain";
import { Effect, type Types } from "effect";

import { callApi } from "@/lib/api";

/**
 * One page of sessions, or `needsHomePoint` when Nearby can't measure
 * distance because I haven't set where I play from.
 */
export type SessionsResult =
  | { readonly kind: "page"; readonly page: SessionsPage }
  | { readonly kind: "needsHomePoint" };

export const listSessions = (scope: SessionScope, cursor?: string): Promise<SessionsResult> => {
  const query: Types.Mutable<SessionsQuery> = { scope };
  if (cursor) {
    query.cursor = cursor;
  }
  return callApi((api) =>
    api.sessions.list({ query }).pipe(
      Effect.map((page): SessionsResult => ({ kind: "page", page })),
      Effect.catchTag("HomePointRequired", () =>
        Effect.succeed<SessionsResult>({ kind: "needsHomePoint" }),
      ),
    ),
  );
};

/** A session with its players, or null when it doesn't exist or I can't see it. */
export const fetchSession = (id: string): Promise<Session | null> =>
  callApi((api) =>
    api.sessions
      .get({ params: { id } })
      .pipe(Effect.catchTag("SessionNotFound", () => Effect.succeed(null))),
  );

/** What a save resolved to: the saved session, or a message the player can act on. */
export type SaveResult =
  | { readonly kind: "saved"; readonly session: Session }
  | { readonly kind: "refused"; readonly message: string };

const saved = (session: Session): SaveResult => ({ kind: "saved", session });
const refused = (message: string) => Effect.succeed<SaveResult>({ kind: "refused", message });

export const createSession = (session: NewSession): Promise<SaveResult> =>
  callApi((api) =>
    api.sessions.create({ payload: session }).pipe(
      Effect.map(saved),
      Effect.catchTags({
        InvalidSession: (e) => refused(e.message),
        ProfileRequired: () => refused("Finish your profile before hosting a session."),
      }),
    ),
  );

export const updateSession = (id: string, patch: SessionPatch): Promise<SaveResult> =>
  callApi((api) =>
    api.sessions.update({ params: { id }, payload: patch }).pipe(
      Effect.map(saved),
      Effect.catchTags({
        InvalidSession: (e) => refused(e.message),
        SessionClosed: () => refused("This session has started or was cancelled."),
        NotSessionHost: () => refused("Only the host can change this session."),
        SessionNotFound: () => refused("This session is no longer available."),
      }),
    ),
  );

export const invitePlayers = (id: string, playerIds: ReadonlyArray<string>): Promise<SaveResult> =>
  callApi((api) =>
    api.sessions.invite({ params: { id }, payload: { playerIds: [...playerIds] } }).pipe(
      Effect.map(saved),
      Effect.catchTags({
        SessionFull: () => refused("Every spot is taken, so there's no room to invite more."),
        SessionClosed: () => refused("This session has started or was cancelled."),
        NotSessionHost: () => refused("Only the host can invite players."),
        SessionNotFound: () => refused("This session is no longer available."),
        PlayerNotFound: () => refused("One of those players is no longer available."),
        InvalidSession: (e) => refused(e.message),
      }),
    ),
  );
