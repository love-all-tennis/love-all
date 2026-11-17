import {
  checkMatchScore,
  isMatchTiebreak,
  isRegularSet,
  type NewSessionResult,
  type ResultSide,
  type SessionResult,
  type SetScore,
} from "@love-all/domain";

/**
 * Score entry for a singles or doubles session, kept free of React so it
 * can be tested. The player recording the score is always on side a, so the
 * form reads "You" against "Them".
 */

/** One set as typed: games (or tiebreak points) for my side and theirs. */
export type SetDraft = { readonly mine: string; readonly theirs: string };

export type ScoreDraft = {
  /** One to three sets, in order. */
  readonly sets: ReadonlyArray<SetDraft>;
  /** Whether the third set was played as a match tiebreak (first to 10). */
  readonly thirdIsTiebreak: boolean;
  /** Doubles only: the player who was on my side. */
  readonly partnerId: string | null;
};

export const MAX_SETS = 3;

const emptySet: SetDraft = { mine: "", theirs: "" };

/** Two empty sets: most matches go two or three. */
export const emptyScoreDraft = (): ScoreDraft => ({
  sets: [emptySet, emptySet],
  thirdIsTiebreak: true,
  partnerId: null,
});

export const addSet = (draft: ScoreDraft): ScoreDraft =>
  draft.sets.length >= MAX_SETS ? draft : { ...draft, sets: [...draft.sets, emptySet] };

/** Removes the last set, keeping at least one. */
export const removeLastSet = (draft: ScoreDraft): ScoreDraft =>
  draft.sets.length <= 1 ? draft : { ...draft, sets: draft.sets.slice(0, -1) };

/** Keeps digits only, at most two, so the field can't hold anything else. */
export const cleanGames = (text: string): string => text.replace(/\D/g, "").slice(0, 2);

export const setGames = (
  draft: ScoreDraft,
  index: number,
  side: keyof SetDraft,
  text: string,
): ScoreDraft => ({
  ...draft,
  sets: draft.sets.map((set, i) => (i === index ? { ...set, [side]: cleanGames(text) } : set)),
});

/** The label for a set's row: "Set 2", or "Match tiebreak" for a tiebreak decider. */
export const setLabel = (draft: ScoreDraft, index: number): string =>
  index === 2 && draft.thirdIsTiebreak ? "Match tiebreak" : `Set ${index + 1}`;

/** Who played: the recorder, the other accepted players, and the session kind. */
export type ScoreContext = {
  readonly kind: "singles" | "doubles";
  readonly meId: string;
  /** Accepted players other than me, host included. */
  readonly others: ReadonlyArray<{ readonly id: string }>;
};

export type ScoreErrors = {
  /** Per set, by index. */
  readonly sets: ReadonlyArray<string | undefined>;
  readonly partner?: string;
  /** About the match as a whole: no winner, a set after the match was won. */
  readonly match?: string;
};

export type ScoreCheck =
  | { readonly ok: true; readonly result: NewSessionResult }
  | { readonly ok: false; readonly errors: ScoreErrors };

/** Whether the session has exactly the players a result needs: 2 for singles, 4 for doubles. */
export const hasFullSides = (ctx: ScoreContext): boolean =>
  ctx.others.length + 1 === (ctx.kind === "doubles" ? 4 : 2);

const sides = (
  ctx: ScoreContext,
  partnerId: string | null,
): { sideA: string[]; sideB: string[] } | string => {
  if (!hasFullSides(ctx)) {
    return ctx.kind === "doubles"
      ? "A doubles score needs four players in the session"
      : "A singles score needs two players in the session";
  }
  if (ctx.kind === "singles") return { sideA: [ctx.meId], sideB: [ctx.others[0]!.id] };
  if (!partnerId || !ctx.others.some((p) => p.id === partnerId)) return "Pick your partner";
  return {
    sideA: [ctx.meId, partnerId],
    sideB: ctx.others.filter((p) => p.id !== partnerId).map((p) => p.id),
  };
};

const setError = (draft: ScoreDraft, index: number): string | undefined => {
  const { mine, theirs } = draft.sets[index]!;
  const label = setLabel(draft, index);
  if (mine === "" || theirs === "") return `Enter both scores for ${label.toLowerCase()}`;
  const set: SetScore = [Number(mine), Number(theirs)];
  if (index === 2 && draft.thirdIsTiebreak) {
    return isMatchTiebreak(set) ? undefined : "A match tiebreak goes to 10, won by 2, like 10–7";
  }
  return isRegularSet(set) ? undefined : `${label} should end 6–0 to 6–4, 7–5 or 7–6`;
};

/**
 * Checks the draft and, when it's a finished match, the body for
 * `POST /sessions/:id/result`. Set errors come first; the match-level check
 * (the domain's `checkMatchScore`) only runs once every set is valid.
 */
export const checkScore = (draft: ScoreDraft, ctx: ScoreContext): ScoreCheck => {
  const setErrors = draft.sets.map((_, i) => setError(draft, i));
  const who = sides(ctx, draft.partnerId);
  const partner = typeof who === "string" ? who : undefined;
  let match: string | undefined;
  const sets = draft.sets.map((s): SetScore => [Number(s.mine), Number(s.theirs)]);
  if (setErrors.every((e) => e === undefined)) {
    const verdict = checkMatchScore(sets);
    if (verdict !== true) match = matchMessage(sets);
  }
  if (setErrors.some((e) => e !== undefined) || partner || match || typeof who === "string") {
    return { ok: false, errors: { sets: setErrors, partner, match } };
  }
  return { ok: true, result: { ...who, sets } };
};

/** The domain's message, in the app's words. Only called on sets that are each valid. */
const matchMessage = (sets: ReadonlyArray<SetScore>): string => {
  let a = 0;
  let b = 0;
  for (const [i, [x, y]] of sets.entries()) {
    if (a === 2 || b === 2) return `The match was over after set ${i}. Remove the extra set.`;
    if (x > y) a++;
    else b++;
  }
  return a === b ? "Add the deciding set: the match is one set all" : "Check the scores";
};

/** "6–4, 3–6, 10–7", from side a's point of view, or flipped for side b. */
export const formatSets = (sets: ReadonlyArray<SetScore>, from: ResultSide = "a"): string =>
  sets.map(([a, b]) => (from === "a" ? `${a}–${b}` : `${b}–${a}`)).join(", ");

export type ResultPlayer = { readonly id: string; readonly displayName: string };

/** "Sam" or "Sam and Alex". Unknown ids (say, a blocked player) read "A player". */
export const sideNames = (
  ids: ReadonlyArray<string>,
  players: ReadonlyArray<ResultPlayer>,
  meId: string | null,
): string =>
  ids
    .map((id) =>
      id === meId ? "You" : (players.find((p) => p.id === id)?.displayName ?? "A player"),
    )
    .join(" and ");

/** How the signed-in player relates to a recorded score. */
export type ResultView = {
  /** "Sam and Alex won 6–4, 3–6, 10–7", with the winners' games first. */
  readonly headline: string;
  readonly status: SessionResult["status"];
  /** "Recorded by Sam · waiting for the other side" and similar. */
  readonly detail: string;
  /** Whether I can confirm or dispute it now. */
  readonly canRespond: boolean;
  /** Whether I can record a new score (after a dispute). */
  readonly canRerecord: boolean;
};

const sideOf = (result: SessionResult, id: string): ResultSide | null =>
  result.sideA.includes(id) ? "a" : result.sideB.includes(id) ? "b" : null;

export const resultView = (
  result: SessionResult,
  players: ReadonlyArray<ResultPlayer>,
  meId: string | null,
): ResultView => {
  const winners = result.winner === "a" ? result.sideA : result.sideB;
  const winnerNames = sideNames(winners, players, meId);
  const headline = `${winnerNames} won ${formatSets(result.sets, result.winner)}`;
  const recorder = sideNames([result.recordedBy], players, meId);
  const responder = result.respondedBy ? sideNames([result.respondedBy], players, meId) : null;
  const recorderSide = sideOf(result, result.recordedBy);
  const mySide = meId ? sideOf(result, meId) : null;
  const onOtherSide = mySide !== null && recorderSide !== null && mySide !== recorderSide;
  const detail =
    result.status === "pending"
      ? onOtherSide
        ? `Recorded by ${recorder}. Confirm it if it's right.`
        : `Recorded by ${recorder}. Waiting for the other side to confirm.`
      : result.status === "confirmed"
        ? `Confirmed by ${responder ?? "the other side"}`
        : `Disputed by ${responder ?? "the other side"}. Record the right score.`;
  return {
    headline,
    status: result.status,
    detail,
    canRespond: result.status === "pending" && onOtherSide,
    canRerecord: result.status === "disputed" && mySide !== null,
  };
};

/** What a session needs before anyone can record its score. */
export type RecordableSession = {
  readonly kind: "singles" | "doubles" | "hitting";
  readonly status: "open" | "confirmed" | "cancelled";
  readonly startsAt: Date;
  readonly me: { readonly state: string } | null;
};

/** Singles and doubles, not cancelled, started, and I'm in it. */
export const canRecordScore = (session: RecordableSession, now: Date): boolean =>
  session.kind !== "hitting" &&
  session.status !== "cancelled" &&
  session.me?.state === "accepted" &&
  session.startsAt.getTime() <= now.getTime();

/** Whether a player can see and write a session's comments: the host and accepted players. */
export const canUseComments = (me: { readonly state: string } | null): boolean =>
  me?.state === "accepted";
