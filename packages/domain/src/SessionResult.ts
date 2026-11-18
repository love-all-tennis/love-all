import { Schema } from "effect";
import { PlayerId } from "./Player";

/**
 * Games won in one set, as `[side a, side b]`. A match tiebreak (played
 * instead of a third set) is entered as points, such as `[10, 7]`.
 */
export const SetScore = Schema.Tuple([
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 99 })),
]);
export type SetScore = typeof SetScore.Type;

export const ResultSide = Schema.Literals(["a", "b"]);
export type ResultSide = typeof ResultSide.Type;

/** Whether a finished set looks like a normal set to 6: 6-0 to 6-4, 7-5 or 7-6. */
export const isRegularSet = ([a, b]: SetScore): boolean => {
  const [won, lost] = a > b ? [a, b] : [b, a];
  return (won === 6 && lost <= 4) || (won === 7 && (lost === 5 || lost === 6));
};

/** Whether a set is a match tiebreak: first to 10, win by 2. */
export const isMatchTiebreak = ([a, b]: SetScore): boolean => {
  const [won, lost] = a > b ? [a, b] : [b, a];
  return won === 10 ? lost <= 8 : won > 10 && won - lost === 2;
};

/**
 * Why a list of set scores isn't a finished best-of-three match, or `true`.
 * One-set matches are fine. A match tiebreak can only be the deciding third
 * set. No sets after a side has won two.
 */
export const checkMatchScore = (sets: ReadonlyArray<SetScore>): string | true => {
  if (sets.length < 1 || sets.length > 3) {
    return "A match has one to three sets";
  }
  let a = 0;
  let b = 0;
  for (const [i, set] of sets.entries()) {
    if (a === 2 || b === 2) {
      return "No sets after a side has won two";
    }
    const deciding = i === 2 && a === 1 && b === 1;
    if (!isRegularSet(set) && !(deciding && isMatchTiebreak(set))) {
      return `Set ${i + 1} (${set[0]}-${set[1]}) isn't a finished set`;
    }
    if (set[0] > set[1]) {
      a++;
    } else {
      b++;
    }
  }
  if (a === b) {
    return "The match has no winner";
  }
  return true;
};

/** Which side won: the one that took more sets. Only call it on a valid score. */
export const winningSide = (sets: ReadonlyArray<SetScore>): ResultSide => {
  const a = sets.filter(([x, y]) => x > y).length;
  return a * 2 > sets.length ? "a" : "b";
};

/** Valid set scores for a finished match, side a first in each set. */
export const MatchScore = Schema.Array(SetScore).check(Schema.makeFilter(checkMatchScore));
export type MatchScore = typeof MatchScore.Type;

/** The players on one side: one for singles, two for doubles. */
const Side = Schema.Array(PlayerId).check(Schema.isBetweenLength(1, 2));

const distinctPlayers = Schema.makeFilter(
  (r: { readonly sideA: ReadonlyArray<string>; readonly sideB: ReadonlyArray<string> }) => {
    const all = [...r.sideA, ...r.sideB];
    if (r.sideA.length !== r.sideB.length) {
      return "Both sides need the same number of players";
    }
    return new Set(all).size === all.length || "A player can only be on one side, once";
  },
);

/**
 * `POST /sessions/:id/result` body. The sides say who played whom: for
 * singles one player each, for doubles two. The server checks the size
 * against the session kind and that everyone listed is an accepted player.
 */
export const NewSessionResult = Schema.Struct({
  sideA: Side,
  sideB: Side,
  sets: MatchScore,
}).check(distinctPlayers);
export type NewSessionResult = typeof NewSessionResult.Type;

/** `pending` until a player on the other side confirms or disputes it. */
export const SessionResultStatus = Schema.Literals(["pending", "confirmed", "disputed"]);
export type SessionResultStatus = typeof SessionResultStatus.Type;

/** `POST /sessions/:id/result/confirm` body. */
export const ResultResponse = Schema.Struct({
  response: Schema.Literals(["confirm", "dispute"]),
});
export type ResultResponse = typeof ResultResponse.Type;

/** The score of a singles or doubles session, as recorded by one of its players. */
export class SessionResult extends Schema.Class<SessionResult>("SessionResult")({
  sideA: Schema.Array(PlayerId),
  sideB: Schema.Array(PlayerId),
  sets: Schema.Array(SetScore),
  winner: ResultSide,
  status: SessionResultStatus,
  /** Null when the player who recorded it deleted their account. */
  recordedBy: Schema.NullOr(PlayerId),
  /** Who confirmed or disputed it; null while pending. */
  respondedBy: Schema.NullOr(PlayerId),
  recordedAt: Schema.DateFromString,
  respondedAt: Schema.NullOr(Schema.DateFromString),
}) {}

export const SESSION_COMMENT_MAX = 1000;

export const CommentBody = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isBetweenLength(1, SESSION_COMMENT_MAX),
);

/** `POST /sessions/:id/comments` body. */
export const NewSessionComment = Schema.Struct({ body: CommentBody });
export type NewSessionComment = typeof NewSessionComment.Type;

export const SessionCommentId = Schema.String.check(Schema.isUUID());

/** A logistics note on a session, such as "Court 4, I'll bring balls". */
export class SessionComment extends Schema.Class<SessionComment>("SessionComment")({
  id: SessionCommentId,
  author: Schema.Struct({
    id: PlayerId,
    displayName: Schema.String,
    photoUrl: Schema.NullOr(Schema.String),
  }),
  body: Schema.String,
  createdAt: Schema.DateFromString,
}) {}

export const SESSION_COMMENTS_PAGE_DEFAULT = 50;
export const SESSION_COMMENTS_PAGE_MAX = 100;

/** `GET /sessions/:id/comments` query. `cursor` is the previous page's `nextCursor`. */
export const SessionCommentsQuery = {
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: SESSION_COMMENTS_PAGE_MAX })),
  ),
};

/** One page of comments, oldest first. `nextCursor` is null on the last page. */
export class SessionCommentsPage extends Schema.Class<SessionCommentsPage>("SessionCommentsPage")({
  items: Schema.Array(SessionComment),
  nextCursor: Schema.NullOr(Schema.String),
}) {}

/** Only the host and accepted players can read or write a session's comments and score. */
export class NotSessionPlayer extends Schema.TaggedError<NotSessionPlayer>()(
  "NotSessionPlayer",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/** No comment with that id, or it was deleted. */
export class CommentNotFound extends Schema.TaggedError<CommentNotFound>()(
  "CommentNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Only the author can delete a comment. */
export class NotCommentAuthor extends Schema.TaggedError<NotCommentAuthor>()(
  "NotCommentAuthor",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

/**
 * A score the session can't take: a hitting session, one that hasn't
 * started, or sides that aren't the session's accepted players.
 */
export class InvalidResult extends Schema.TaggedError<InvalidResult>()(
  "InvalidResult",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

/** The score is already recorded and not disputed, or has already been answered. */
export class ResultConflict extends Schema.TaggedError<ResultConflict>()(
  "ResultConflict",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

/** No score has been recorded for the session yet. */
export class ResultNotFound extends Schema.TaggedError<ResultNotFound>()(
  "ResultNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

/** Only a player on the side that didn't record the score can confirm or dispute it. */
export class NotOnOtherSide extends Schema.TaggedError<NotOnOtherSide>()(
  "NotOnOtherSide",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}
