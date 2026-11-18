import type { ForumReactionKind } from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";

/**
 * Forum calls. Each call that can be refused for a reason the player can act
 * on resolves to `{ refusal }` with copy to show; a network failure rejects,
 * and the screen says to try again.
 */
export type Outcome<A> = { readonly ok: A } | { readonly refusal: string };

const refuse = (refusal: string) => Effect.succeed<{ refusal: string }>({ refusal });

const GONE = "This thread is no longer available.";

export const fetchCategories = () => callApi((api) => api.forum.listCategories());

/** A page of a category's threads, or null when the category isn't open to me. */
export const fetchThreads = (categoryId: string, cursor?: string) =>
  callApi((api) =>
    api.forum
      .listThreads({ query: cursor ? { categoryId, cursor } : { categoryId } })
      .pipe(Effect.catchTag("ForumCategoryNotFound", () => Effect.succeed(null))),
  );

/** The thread with a page of replies, or null when it's gone or hidden from me. */
export const fetchThread = (id: string, cursor?: string) =>
  callApi((api) =>
    api.forum
      .getThread({ params: { id }, query: cursor ? { cursor } : {} })
      .pipe(Effect.catchTag("ForumThreadNotFound", () => Effect.succeed(null))),
  );

export const createThread = (input: {
  readonly categoryId: string;
  readonly title: string;
  readonly body: string;
}) =>
  callApi((api) =>
    api.forum.createThread({ payload: input }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        ForumCategoryNotFound: () => refuse("That category isn't open to you. Pick another one."),
        ForumRateLimited: (e) => refuse(e.message),
      }),
    ),
  );

export const reply = (threadId: string, body: string) =>
  callApi((api) =>
    api.forum.reply({ params: { id: threadId }, payload: { body } }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        ForumThreadNotFound: () => refuse(GONE),
        ForumRateLimited: (e) => refuse(e.message),
      }),
    ),
  );

export const deleteThread = (id: string) =>
  callApi((api) =>
    api.forum.deleteThread({ params: { id } }).pipe(
      Effect.as({ ok: null }),
      Effect.catchTag("ForumThreadNotFound", () => Effect.succeed({ ok: null })),
      Effect.catchTag("NotForumAuthor", () => refuse("You can only delete your own threads.")),
    ),
  );

export const deletePost = (id: string) =>
  callApi((api) =>
    api.forum.deletePost({ params: { id } }).pipe(
      Effect.as({ ok: null }),
      Effect.catchTag("ForumPostNotFound", () => Effect.succeed({ ok: null })),
      Effect.catchTag("NotForumAuthor", () => refuse("You can only delete your own replies.")),
    ),
  );

/** Adds or removes my reaction on a thread or reply. */
export const setReaction = (
  target: "thread" | "post",
  id: string,
  kind: ForumReactionKind,
  on: boolean,
) =>
  callApi((api) => {
    const params = { id, kind };

    if (target === "thread") {
      return (
        on ? api.forum.reactToThread({ params }) : api.forum.unreactToThread({ params })
      ).pipe(
        Effect.as({ ok: null }),
        Effect.catchTag("ForumThreadNotFound", () => refuse(GONE)),
      );
    }

    return (on ? api.forum.reactToPost({ params }) : api.forum.unreactToPost({ params })).pipe(
      Effect.as({ ok: null }),
      Effect.catchTag("ForumPostNotFound", () => refuse("This reply is no longer there.")),
    );
  });
