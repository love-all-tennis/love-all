import { SessionResult } from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  addSet,
  canRecordScore,
  canUseComments,
  checkScore,
  cleanGames,
  emptyScoreDraft,
  formatSets,
  isPastSession,
  pastScoreLine,
  removeLastSet,
  resultView,
  setGames,
  setLabel,
  type ScoreContext,
  type ScoreDraft,
} from "./score";

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const ALEX = "33333333-3333-4333-8333-333333333333";
const JO = "44444444-4444-4444-8444-444444444444";

const singles: ScoreContext = { kind: "singles", meId: ME, others: [{ id: SAM }] };

const doubles: ScoreContext = {
  kind: "doubles",
  meId: ME,
  others: [{ id: SAM }, { id: ALEX }, { id: JO }],
};

const draftOf = (sets: ReadonlyArray<[string, string]>, extra: Partial<ScoreDraft> = {}) => ({
  ...emptyScoreDraft(),
  sets: sets.map(([mine, theirs]) => ({ mine, theirs })),
  ...extra,
});

describe("editing a score", () => {
  it("starts with two empty sets and a match tiebreak decider", () => {
    const draft = emptyScoreDraft();
    expect(draft.sets).toHaveLength(2);
    expect(draft.thirdIsTiebreak).toBe(true);
  });

  it("adds up to three sets and keeps at least one", () => {
    const three = addSet(addSet(emptyScoreDraft()));
    expect(three.sets).toHaveLength(3);
    expect(addSet(addSet(three)).sets).toHaveLength(3);
    expect(removeLastSet(removeLastSet(removeLastSet(three))).sets).toHaveLength(1);
  });

  it("keeps only up to two digits", () => {
    expect(cleanGames("6")).toBe("6");
    expect(cleanGames("1a0")).toBe("10");
    expect(cleanGames("123")).toBe("12");
    expect(cleanGames("-")).toBe("");
    expect(setGames(emptyScoreDraft(), 1, "theirs", "4 ").sets[1]).toEqual({
      mine: "",
      theirs: "4",
    });
  });

  it("names the third set after its format", () => {
    const draft = addSet(emptyScoreDraft());
    expect(setLabel(draft, 0)).toBe("Set 1");
    expect(setLabel(draft, 2)).toBe("Match tiebreak");
    expect(setLabel({ ...draft, thirdIsTiebreak: false }, 2)).toBe("Set 3");
  });
});

describe("checkScore", () => {
  it("accepts a straight-sets singles win with me on side a", () => {
    expect(
      checkScore(
        draftOf([
          ["6", "4"],
          ["7", "5"],
        ]),
        singles,
      ),
    ).toEqual({
      ok: true,
      result: {
        sideA: [ME],
        sideB: [SAM],
        sets: [
          [6, 4],
          [7, 5],
        ],
      },
    });
  });

  it("accepts a one-set match and a loss", () => {
    const check = checkScore(draftOf([["3", "6"]]), singles);
    expect(check.ok && check.result.sets).toEqual([[3, 6]]);
  });

  it("accepts a match tiebreak as the decider", () => {
    const check = checkScore(
      draftOf([
        ["6", "4"],
        ["3", "6"],
        ["10", "7"],
      ]),
      singles,
    );

    expect(check.ok && check.result.sets).toEqual([
      [6, 4],
      [3, 6],
      [10, 7],
    ]);
    expect(
      checkScore(
        draftOf([
          ["6", "4"],
          ["3", "6"],
          ["12", "10"],
        ]),
        singles,
      ).ok,
    ).toBe(true);
  });

  it("accepts a full third set when the tiebreak is off", () => {
    const draft = draftOf(
      [
        ["6", "4"],
        ["3", "6"],
        ["7", "6"],
      ],
      { thirdIsTiebreak: false },
    );

    expect(checkScore(draft, singles).ok).toBe(true);
    expect(checkScore({ ...draft, thirdIsTiebreak: true }, singles).ok).toBe(false);
  });

  it("says which set is missing or unfinished", () => {
    const check = checkScore(
      draftOf([
        ["6", ""],
        ["5", "4"],
      ]),
      singles,
    );

    expect(check.ok).toBe(false);

    if (check.ok) return;
    expect(check.errors.sets[0]).toBe("Enter both scores for set 1");
    expect(check.errors.sets[1]).toBe("Set 2 should end 6–0 to 6–4, 7–5 or 7–6");
    expect(check.errors.match).toBeUndefined();
  });

  it("rejects a match tiebreak that isn't won by 2", () => {
    const check = checkScore(
      draftOf([
        ["6", "4"],
        ["3", "6"],
        ["10", "9"],
      ]),
      singles,
    );

    expect(!check.ok && check.errors.sets[2]).toBe(
      "A match tiebreak goes to 10, won by 2, like 10–7",
    );
  });

  it("asks for a decider at one set all", () => {
    const check = checkScore(
      draftOf([
        ["6", "4"],
        ["3", "6"],
      ]),
      singles,
    );

    expect(!check.ok && check.errors.match).toBe("Add the deciding set: the match is one set all");
  });

  it("rejects a set after the match was won", () => {
    const draft = draftOf([
      ["6", "4"],
      ["6", "3"],
      ["10", "4"],
    ]);

    const check = checkScore(draft, singles);
    expect(!check.ok && check.errors.match).toBe(
      "The match was over after set 2. Remove the extra set.",
    );
  });

  it("puts me and my partner on side a in doubles", () => {
    const draft = draftOf(
      [
        ["6", "2"],
        ["6", "2"],
      ],
      { partnerId: ALEX },
    );

    expect(checkScore(draft, doubles)).toEqual({
      ok: true,
      result: {
        sideA: [ME, ALEX],
        sideB: [SAM, JO],
        sets: [
          [6, 2],
          [6, 2],
        ],
      },
    });
  });

  it("asks for a partner in doubles", () => {
    const check = checkScore(
      draftOf([
        ["6", "2"],
        ["6", "2"],
      ]),
      doubles,
    );

    expect(!check.ok && check.errors.partner).toBe("Pick your partner");

    const stranger = draftOf(
      [
        ["6", "2"],
        ["6", "2"],
      ],
      { partnerId: "nobody" },
    );

    expect(!checkScore(stranger, doubles).ok).toBe(true);
  });

  it("needs a full session", () => {
    const short = { ...doubles, others: [{ id: SAM }] };

    const check = checkScore(
      draftOf(
        [
          ["6", "2"],
          ["6", "2"],
        ],
        { partnerId: SAM },
      ),
      short,
    );

    expect(!check.ok && check.errors.partner).toBe(
      "A doubles score needs four players in the session",
    );
  });
});

describe("showing a result", () => {
  const players = [
    { id: ME, displayName: "Chris" },
    { id: SAM, displayName: "Sam" },
    { id: ALEX, displayName: "Alex" },
    { id: JO, displayName: "Jo" },
  ];

  const result = (fields: Partial<ConstructorParameters<typeof SessionResult>[0]> = {}) =>
    new SessionResult({
      sideA: [SAM],
      sideB: [ME],
      sets: [
        [6, 4],
        [3, 6],
        [10, 7],
      ],
      winner: "a",
      status: "pending",
      recordedBy: SAM,
      respondedBy: null,
      recordedAt: new Date("2026-11-20T20:00:00Z"),
      respondedAt: null,
      ...fields,
    });

  it("formats sets with an en dash from either side", () => {
    expect(
      formatSets([
        [6, 4],
        [3, 6],
        [10, 7],
      ]),
    ).toBe("6–4, 3–6, 10–7");
    expect(
      formatSets(
        [
          [6, 4],
          [3, 6],
          [10, 7],
        ],
        "b",
      ),
    ).toBe("4–6, 6–3, 7–10");
  });

  it("lets the other side confirm a pending score", () => {
    const view = resultView(result(), players, ME);
    expect(view.headline).toBe("Sam won 6–4, 3–6, 10–7");
    expect(view.canRespond).toBe(true);
    expect(view.detail).toBe("Recorded by Sam. Confirm it if it's right.");
  });

  it("shows the winners' games first", () => {
    const view = resultView(
      result({
        winner: "b",
        sets: [
          [4, 6],
          [2, 6],
        ],
      }),
      players,
      ME,
    );

    expect(view.headline).toBe("You won 6–4, 6–2");
  });

  it("doesn't let the recorder's side confirm", () => {
    const view = resultView(
      result({ sideA: [SAM, ALEX], sideB: [ME, JO], recordedBy: SAM }),
      players,
      ALEX,
    );

    expect(view.headline).toBe("Sam and You won 6–4, 3–6, 10–7");
    expect(view.canRespond).toBe(false);
    expect(view.detail).toBe("Recorded by Sam. Waiting for the other side to confirm.");
  });

  it("lets either side record again after a dispute", () => {
    const view = resultView(result({ status: "disputed", respondedBy: ME }), players, SAM);
    expect(view.detail).toBe("Disputed by Chris. Record the right score.");
    expect(view.canRerecord).toBe(true);
    expect(view.canRespond).toBe(false);
  });

  it("lets either side confirm a score whose recorder deleted their account", () => {
    const view = resultView(result({ recordedBy: null }), players, SAM);
    expect(view.detail).toBe("Recorded by a deleted account. Confirm it if it's right.");
    expect(view.canRespond).toBe(true);
    expect(pastScoreLine(result({ recordedBy: null }), ME)).toBe("Score to confirm");
  });

  it("names a player it can't see", () => {
    const view = resultView(result({ status: "confirmed", respondedBy: ME }), [], null);
    expect(view.headline).toBe("A player won 6–4, 3–6, 10–7");
    expect(view.canRerecord).toBe(false);
  });
});

describe("who can do what", () => {
  const session = {
    kind: "singles" as const,
    status: "confirmed" as const,
    startsAt: new Date("2026-11-20T18:00:00Z"),
    me: { state: "accepted" },
  };

  const after = new Date("2026-11-20T19:00:00Z");

  it("lets accepted players record a started singles or doubles score", () => {
    expect(canRecordScore(session, after)).toBe(true);
    expect(canRecordScore(session, new Date("2026-11-20T17:00:00Z"))).toBe(false);
    expect(canRecordScore({ ...session, kind: "hitting" }, after)).toBe(false);
    expect(canRecordScore({ ...session, status: "cancelled" }, after)).toBe(false);
    expect(canRecordScore({ ...session, me: { state: "invited" } }, after)).toBe(false);
    expect(canRecordScore({ ...session, me: null }, after)).toBe(false);
  });

  it("shows comments to accepted players only", () => {
    expect(canUseComments({ state: "accepted" })).toBe(true);
    expect(canUseComments({ state: "requested" })).toBe(false);
    expect(canUseComments(null)).toBe(false);
  });
});

describe("past sessions", () => {
  const now = new Date("2026-11-20T18:00:00Z");
  it("counts a session as past once it starts", () => {
    expect(isPastSession({ startsAt: new Date("2026-11-20T17:59:00Z") }, now)).toBe(true);
    expect(isPastSession({ startsAt: now }, now)).toBe(true);
    expect(isPastSession({ startsAt: new Date("2026-11-20T18:01:00Z") }, now)).toBe(false);
  });

  it("shows a confirmed score, or that mine is to confirm", () => {
    const base = {
      sideA: [SAM],
      sideB: [ME],
      sets: [
        [6, 4],
        [6, 4],
      ] as const,
      winner: "a" as const,
      recordedBy: SAM,
      recordedAt: now,
    };

    const confirmed = new SessionResult({
      ...base,
      sets: [...base.sets],
      status: "confirmed",
      respondedBy: ME,
      respondedAt: now,
    });

    const pending = new SessionResult({
      ...base,
      sets: [...base.sets],
      status: "pending",
      respondedBy: null,
      respondedAt: null,
    });

    expect(pastScoreLine(confirmed, ME)).toBe("Lost 4–6, 4–6");
    expect(pastScoreLine(confirmed, SAM)).toBe("Won 6–4, 6–4");
    expect(pastScoreLine(pending, ME)).toBe("Score to confirm");
    expect(pastScoreLine(pending, SAM)).toBeNull();
    expect(pastScoreLine(null, ME)).toBeNull();
  });
});
