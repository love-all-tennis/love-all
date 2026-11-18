import { Schema } from "effect";
import { PlayerId } from "./Player";

/**
 * Direct messages: async one-to-one conversations for sorting out a match
 * or a hit. There are no typing indicators or online status; the app
 * refreshes when you open a conversation or pull down.
 *
 * Two players share at most one conversation. A block either way ends it
 * for both: it drops out of both inboxes and neither can read or send.
 */

export const ConversationId = Schema.String.check(Schema.isUUID());
export type ConversationId = typeof ConversationId.Type;

export const DirectMessageId = Schema.String.check(Schema.isUUID());
export type DirectMessageId = typeof DirectMessageId.Type;

export const MESSAGE_BODY_MAX = 2000;

export const MessageBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, MESSAGE_BODY_MAX),
);

/**
 * Sending limits per player, to blunt spam: messages in the last hour, and
 * new conversations started in the last hour.
 */
export const MESSAGES_PER_HOUR = 120;
export const CONVERSATIONS_PER_HOUR = 10;

/** The other player in a conversation. */
export const ConversationPlayer = Schema.Struct({
  id: PlayerId,
  displayName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
});
export type ConversationPlayer = typeof ConversationPlayer.Type;

/** One message. `mine` is true when I sent it. */
export class DirectMessage extends Schema.Class<DirectMessage>("DirectMessage")({
  id: DirectMessageId,
  conversationId: ConversationId,
  senderId: PlayerId,
  mine: Schema.Boolean,
  body: Schema.String,
  createdAt: Schema.DateFromString,
}) {}

/**
 * A conversation as it appears in my inbox, and at the top of the
 * conversation screen.
 */
export class Conversation extends Schema.Class<Conversation>("Conversation")({
  id: ConversationId,
  otherPlayer: ConversationPlayer,
  /** Null until the first message. */
  lastMessage: Schema.NullOr(DirectMessage),
  /** Messages from the other player I haven't read yet. */
  unreadCount: Schema.Int,
  createdAt: Schema.DateFromString,
}) {}

export const MESSAGES_PAGE_DEFAULT = 30;
export const MESSAGES_PAGE_MAX = 100;

const MessagesPageSize = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: MESSAGES_PAGE_MAX }),
);

/** `GET /conversations` query. `cursor` is the previous page's `nextCursor`. */
export const ConversationsQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(MessagesPageSize),
};
export type ConversationsQuery = Schema.Struct<typeof ConversationsQuery>["Type"];

/**
 * One page of my inbox, latest message first. Conversations with no
 * messages yet are left out. `unreadConversations` counts every
 * conversation with unread messages, not only this page's, for the tab badge.
 */
export class ConversationsPage extends Schema.Class<ConversationsPage>("ConversationsPage")({
  items: Schema.Array(Conversation),
  nextCursor: Schema.NullOr(Schema.String),
  unreadConversations: Schema.Int,
}) {}

/** `POST /conversations` body: who to talk to. */
export const NewConversation = Schema.Struct({ playerId: PlayerId });
export type NewConversation = typeof NewConversation.Type;

/** `GET /conversations/:id/messages` query: paging back through older messages. */
export const MessagesQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(MessagesPageSize),
};
export type MessagesQuery = Schema.Struct<typeof MessagesQuery>["Type"];

/**
 * The conversation and one page of its messages, newest first. The next
 * page (`nextCursor`) holds older ones.
 */
export class MessagesPage extends Schema.Class<MessagesPage>("MessagesPage")({
  conversation: Conversation,
  items: Schema.Array(DirectMessage),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** `POST /conversations/:id/messages` body. */
export const NewDirectMessage = Schema.Struct({ body: MessageBody });
export type NewDirectMessage = typeof NewDirectMessage.Type;

/** No conversation with that id that I'm in, or a block either way ended it. */
export class ConversationNotFound extends Schema.TaggedError<ConversationNotFound>()(
  "ConversationNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Players can't message themselves. */
export class CannotMessageSelf extends Schema.TaggedError<CannotMessageSelf>()(
  "CannotMessageSelf",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** Too many messages, or new conversations, in the last hour. */
export class MessagesRateLimited extends Schema.TaggedError<MessagesRateLimited>()(
  "MessagesRateLimited",
  { message: Schema.String },
  { httpApiStatus: 429 },
) {}
