import type { NewSessionResult, SessionResult } from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";

/**
 * Comments and scores on a session. Each call that can be refused for a
 * reason the player can act on resolves to `{ refusal }` with copy to show;
 * a network failure rejects, and the screen says to try again.
 */
export type Outcome<A> = { readonly ok: A } | { readonly refusal: string };

type ResultListener = (sessionId: string, result: SessionResult) => void;
const resultListeners = new Set<ResultListener>();

/**
 * Hears every score this app records or answers, so a session screen under
 * the Record score sheet updates when the sheet closes.
 */
export const onResultChanged = (listener: ResultListener) => {
  resultListeners.add(listener);
  return () => {
    resultListeners.delete(listener);
  };
};

const announce = (sessionId: string) => (result: SessionResult) => {
  for (const listener of resultListeners) listener(sessionId, result);
  return { ok: result };
};

const refuse = (refusal: string) => Effect.succeed<{ refusal: string }>({ refusal });

/** The session, or null when it's gone or hidden from me. */
export const fetchSession = (id: string) =>
  callApi((api) =>
    api.sessions
      .get({ params: { id } })
      .pipe(Effect.catchTag("SessionNotFound", () => Effect.succeed(null))),
  );

export const fetchComments = (id: string, cursor?: string) =>
  callApi((api) =>
    api.sessionActivity.listComments({
      params: { id },
      query: cursor ? { cursor } : {},
    }),
  );

export const postComment = (id: string, body: string) =>
  callApi((api) =>
    api.sessionActivity.addComment({ params: { id }, payload: { body } }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        SessionClosed: () => refuse("This session was cancelled, so comments are closed."),
        NotSessionPlayer: () => refuse("Only players in this session can comment."),
        SessionNotFound: () => refuse("This session is no longer available."),
      }),
    ),
  );

export const deleteComment = (commentId: string) =>
  callApi((api) =>
    api.sessionActivity.deleteComment({ params: { commentId } }).pipe(
      Effect.as({ ok: null }),
      Effect.catchTag("CommentNotFound", () => Effect.succeed({ ok: null })),
      Effect.catchTag("NotCommentAuthor", () => refuse("You can only delete your own comments.")),
    ),
  );

/** The score, or null when nobody has recorded one (or I can't see it). */
export const fetchResult = (id: string) =>
  callApi((api) =>
    api.sessionActivity.getResult({ params: { id } }).pipe(
      Effect.catchTags({
        SessionNotFound: () => Effect.succeed(null),
        NotSessionPlayer: () => Effect.succeed(null),
      }),
    ),
  );

export const recordResult = (id: string, result: NewSessionResult) =>
  callApi((api) =>
    api.sessionActivity.recordResult({ params: { id }, payload: result }).pipe(
      Effect.map(announce(id)),
      Effect.catchTags({
        ResultConflict: () =>
          refuse("Someone already recorded this score. Close this and check the session."),
        InvalidResult: (e) => refuse(e.message),
        SessionClosed: () => refuse("This session was cancelled, so it can't take a score."),
        NotSessionPlayer: () => refuse("Only players in this session can record its score."),
        SessionNotFound: () => refuse("This session is no longer available."),
      }),
    ),
  );

export const respondToResult = (id: string, response: "confirm" | "dispute") =>
  callApi((api) =>
    api.sessionActivity.respondToResult({ params: { id }, payload: { response } }).pipe(
      Effect.map(announce(id)),
      Effect.catchTags({
        ResultConflict: () => refuse("Someone already answered this score."),
        NotOnOtherSide: () => refuse("Only the other side can confirm or dispute this score."),
        ResultNotFound: () => refuse("This score is no longer there."),
        NotSessionPlayer: () => refuse("Only players in this session can answer its score."),
        SessionNotFound: () => refuse("This session is no longer available."),
      }),
    ),
  );
