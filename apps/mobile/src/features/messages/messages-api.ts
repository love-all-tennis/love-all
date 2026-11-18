import type {
  Conversation,
  ConversationsPage,
  DirectMessage,
  MessagesPage,
} from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";

/**
 * Direct message calls. A refusal the player can act on resolves to
 * `{ refusal }` with copy to show; a network failure rejects, and the
 * screen says to try again.
 */
export type Outcome<A> = { readonly ok: A } | { readonly refusal: string };

const refuse = (refusal: string) => Effect.succeed<{ refusal: string }>({ refusal });

/** Shown when a conversation is gone: blocked either way, or not mine. */
export const GONE = "This conversation isn't available any more.";

export const fetchInbox = (cursor?: string): Promise<ConversationsPage> =>
  callApi((api) => api.messages.listConversations({ query: cursor ? { cursor } : {} }));

/** The conversation and a page of messages, or null when it's gone. */
export const fetchMessages = (id: string, cursor?: string): Promise<MessagesPage | null> =>
  callApi((api) =>
    api.messages
      .listMessages({ params: { id }, query: cursor ? { cursor } : {} })
      .pipe(Effect.catchTag("ConversationNotFound", () => Effect.succeed(null))),
  );

/** Opens my conversation with a player, starting one if there's none. */
export const openConversation = (playerId: string): Promise<Outcome<Conversation>> =>
  callApi((api) =>
    api.messages.openConversation({ payload: { playerId } }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        PlayerNotFound: () => refuse("This player isn't available to message."),
        CannotMessageSelf: () => refuse("You can't message yourself."),
        ProfileRequired: () => refuse("Finish your profile before messaging players."),
        MessagesRateLimited: (e) => refuse(e.message),
      }),
    ),
  );

export const sendMessage = (id: string, body: string): Promise<Outcome<DirectMessage>> =>
  callApi((api) =>
    api.messages.send({ params: { id }, payload: { body } }).pipe(
      Effect.map((ok) => ({ ok })),
      Effect.catchTags({
        ConversationNotFound: () => refuse(GONE),
        MessagesRateLimited: (e) => refuse(e.message),
      }),
    ),
  );

/** Marks the conversation read. A gone conversation has nothing left to read. */
export const markRead = (id: string): Promise<void> =>
  callApi((api) =>
    api.messages
      .markRead({ params: { id } })
      .pipe(Effect.catchTag("ConversationNotFound", () => Effect.void)),
  );
