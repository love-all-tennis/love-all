/**
 * Times in notifications are shown in the launch metro's time zone. The API
 * doesn't know each phone's zone, and every v1 player is in Detroit. Revisit
 * when a metro in another zone launches (store a zone on `metro`).
 */
export const NOTIFICATION_TIME_ZONE = "America/Detroit";

export type SessionKind = "singles" | "doubles" | "hitting";

/** The facts about a session that notifications mention. */
export interface SessionFacts {
  readonly id: string;
  readonly kind: SessionKind;
  readonly startsAt: Date;
  readonly courtName: string;
}

const kindName: Record<SessionKind, string> = {
  singles: "singles",
  doubles: "doubles",
  hitting: "hitting session",
};

/** "Sat, Nov 22 at 9:00 AM" */
export const whenLabel = (date: Date) =>
  `${new Intl.DateTimeFormat("en-US", {
    timeZone: NOTIFICATION_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date)} at ${timeLabel(date)}`;

/** "9:00 AM" */
export const timeLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: NOTIFICATION_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

const sessionLabel = (s: SessionFacts) => `${kindName[s.kind]} on ${whenLabel(s.startsAt)}`;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const sessionUrl = (id: string) => `/sessions/${id}`;
export const threadUrl = (id: string) => `/forum/thread/${id}`;
export const conversationUrl = (id: string) => `/messages/${id}`;

interface Message {
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

const about = (s: SessionFacts, title: string, body: string) =>
  ({
    title,
    body,
    url: sessionUrl(s.id),
  }) satisfies Message;

export const messages = {
  invited: (s: SessionFacts, host: string) =>
    about(s, `${host} invited you to play`, `${capitalize(sessionLabel(s))} at ${s.courtName}`),

  askedToJoin: (s: SessionFacts, player: string) =>
    about(s, `${player} asked to join`, `Your ${sessionLabel(s)}. Tap to approve or decline.`),

  acceptedInvite: (s: SessionFacts, player: string) =>
    about(s, `${player} is in`, `They accepted your invite to ${sessionLabel(s)}`),

  declinedInvite: (s: SessionFacts, player: string) =>
    about(s, `${player} can't make it`, `They declined your invite to ${sessionLabel(s)}`),

  approved: (s: SessionFacts, host: string) =>
    about(s, "You're in", `${host} approved you for ${sessionLabel(s)} at ${s.courtName}`),

  notApproved: (s: SessionFacts, host: string) =>
    about(s, "Request not approved", `${host}'s ${sessionLabel(s)} isn't a fit this time`),

  confirmed: (s: SessionFacts) =>
    about(s, "Session confirmed", `Every spot is filled for ${sessionLabel(s)} at ${s.courtName}`),

  left: (s: SessionFacts, player: string) =>
    about(s, `${player} left`, `A spot opened up in your ${sessionLabel(s)}`),

  cancelled: (s: SessionFacts, host: string) =>
    about(s, "Session cancelled", `${host} cancelled ${sessionLabel(s)} at ${s.courtName}`),

  reminder: (s: SessionFacts) =>
    about(
      s,
      `${capitalize(kindName[s.kind])} at ${timeLabel(s.startsAt)}`,
      `Starting soon at ${s.courtName}`,
    ),

  forumReply: (thread: { id: string; title: string }, replier: string, reply: string) => ({
    title: `${replier} replied to "${truncate(thread.title, 60)}"`,
    body: truncate(reply, 140),
    url: threadUrl(thread.id),
  }),

  /** A new direct message: the sender's name, then the start of what they wrote. */
  directMessage: (conversationId: string, sender: string, body: string) => ({
    title: sender,
    body: truncate(body, 140),
    url: conversationUrl(conversationId),
  }),
};

/** Cuts `text` to `max` characters, ending with an ellipsis when it was longer. */
export const truncate = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};
