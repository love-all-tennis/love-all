import type { MySessionPlace, SessionStatus, SessionVisibility } from "@love-all/domain";

/** The fields of a session (summary or detail) that decide what I can do. */
export type JoinFacts = {
  readonly status: SessionStatus;
  readonly startsAt: Date;
  readonly visibility: SessionVisibility;
  readonly spots: number;
  readonly acceptedCount: number;
  readonly requestCount: number;
  readonly me: MySessionPlace | null;
};

export const spotsLeft = (s: JoinFacts) => Math.max(0, s.spots - s.acceptedCount);

const hasStarted = (s: JoinFacts, now: Date) => s.startsAt.getTime() <= now.getTime();

/**
 * The one thing the detail screen offers me, by where I stand:
 * - `answerInvite`: Accept and Decline. When `full`, only Decline works.
 * - `askToJoin`: an open session with a spot I can ask for.
 * - `requested`: I asked; it waits on the host. I can withdraw.
 * - `leave`: I have a spot and can give it up.
 * - `host`: I host it and can cancel it.
 * - `none`: nothing to do, with a line saying why (or null to say nothing).
 */
export type ViewerAction =
  | { readonly kind: "answerInvite"; readonly full: boolean }
  | { readonly kind: "askToJoin" }
  | { readonly kind: "requested" }
  | { readonly kind: "leave" }
  | { readonly kind: "host" }
  | { readonly kind: "none"; readonly note: string | null };

export const viewerAction = (s: JoinFacts, now: Date) => {
  if (s.status === "cancelled") return { kind: "none", note: "This session was cancelled." };

  if (hasStarted(s, now)) return { kind: "none", note: "This session has already started." };
  const full = spotsLeft(s) === 0;
  const me = s.me;

  if (me?.role === "host") return { kind: "host" };

  switch (me?.state) {
    case "invited":
      return { kind: "answerInvite", full };
    case "requested":
      return { kind: "requested" };
    case "accepted":
      return { kind: "leave" };
    case "declined":
      return { kind: "none", note: "You're not playing in this session." };
    case "left":
    case undefined:
      if (s.visibility === "invite_only") {
        return {
          kind: "none",
          note: me ? "You left this session. It's invite only." : "This session is invite only.",
        };
      }

      if (full) return { kind: "none", note: "Every spot is taken." };

      return { kind: "askToJoin" };
  }
};

/** Whether a session in My sessions waits on me: an invite, or requests to my session. */
export const needsMyAnswer = (s: JoinFacts, now: Date) =>
  s.status !== "cancelled" &&
  !hasStarted(s, now) &&
  (s.me?.state === "invited" || (s.me?.role === "host" && s.requestCount > 0));

/**
 * Splits My sessions into the "Needs your answer" group, soonest first, and
 * the rest in the order the API sent them.
 */
export const groupMySessions = <S extends JoinFacts>(sessions: ReadonlyArray<S>, now: Date) => {
  const needsAnswer: Array<S> = [];
  const rest: Array<S> = [];

  for (const s of sessions) (needsMyAnswer(s, now) ? needsAnswer : rest).push(s);
  needsAnswer.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return { needsAnswer, rest };
};

/**
 * A change I make from the detail screen. `approve` and `reject` are the
 * host's answers to one player's request.
 */
export type JoinChange =
  | { readonly kind: "accept" }
  | { readonly kind: "decline" }
  | { readonly kind: "request" }
  | { readonly kind: "leave" }
  | { readonly kind: "cancel" }
  | { readonly kind: "approve"; readonly userId: string }
  | { readonly kind: "reject"; readonly userId: string };

/**
 * Changes that can be shown before the server answers, because they never
 * fail for lack of a spot. Accepting and approving wait for the server, since
 * someone else may have just taken the last spot.
 */
export const isOptimistic = (change: JoinChange) =>
  change.kind !== "accept" && change.kind !== "approve";

type Participant = { readonly player: { readonly id: string }; readonly state: string };

/** A session with its players, as much of it as an optimistic update touches. */
export type JoinDetail = JoinFacts & {
  readonly host: { readonly id: string };
  readonly participants: ReadonlyArray<Participant>;
};

const withStatus = <S extends JoinDetail>(s: S, acceptedCount: number) => ({
  ...s,
  acceptedCount,
  status: s.status === "cancelled" ? s.status : acceptedCount >= s.spots ? "confirmed" : "open",
});

const setParticipant = <S extends JoinDetail>(
  s: S,
  userId: string,
  state: MySessionPlace["state"],
) => ({
  ...s,
  participants: s.participants.map((p) => (p.player.id === userId ? { ...p, state } : p)),
});

/**
 * How the session looks once `change` (made by `myId`) goes through. The
 * screen shows this right away for optimistic changes, then reloads.
 */
export const applyChange = <S extends JoinDetail>(s: S, change: JoinChange, myId: string) => {
  const mine = (state: MySessionPlace["state"]) => {
    const next = setParticipant(s, myId, state);

    return { ...next, me: next.me && { ...next.me, state } };
  };

  switch (change.kind) {
    case "accept":
      return withStatus(mine("accepted"), s.acceptedCount + 1);
    case "decline":
      return mine("declined");
    case "request":
      return s.me ? mine("requested") : { ...s, me: { role: "player", state: "requested" } };
    case "leave":
      return s.me?.state === "accepted"
        ? withStatus(mine("left"), s.acceptedCount - 1)
        : mine("left");
    case "cancel":
      return { ...s, status: "cancelled" };
    case "approve":
      return withStatus(
        {
          ...setParticipant(s, change.userId, "accepted"),
          requestCount: Math.max(0, s.requestCount - 1),
        },
        s.acceptedCount + 1,
      );
    case "reject":
      return {
        ...setParticipant(s, change.userId, "declined"),
        requestCount: Math.max(0, s.requestCount - 1),
      };
  }
};

/** Players waiting on the host's answer, as the host sees the session. */
export const pendingRequests = <P extends Participant>(s: {
  readonly participants: ReadonlyArray<P>;
}) => s.participants.filter((p) => p.state === "requested");

/** What the confirm step for cancelling says. */
export const cancelPrompt = (s: JoinFacts) => {
  const others = s.acceptedCount - 1;

  return {
    title: "Cancel this session?",
    body:
      others > 0
        ? `${others === 1 ? "The other player" : `The ${others} other players`} will see it's off. You can't undo this.`
        : "Anyone invited will see it's off. You can't undo this.",
  };
};
