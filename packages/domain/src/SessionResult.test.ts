import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  MatchScore,
  NewSessionComment,
  NewSessionResult,
  SESSION_COMMENT_MAX,
  winningSide,
} from "./SessionResult";

const score = Schema.decodeUnknownExit(MatchScore);
const ok = (sets: unknown) => expect(score(sets)._tag).toBe("Success");
const bad = (sets: unknown) => expect(score(sets)._tag).toBe("Failure");

describe("MatchScore", () => {
  it("accepts normal two- and three-set matches", () => {
    ok([
      [6, 4],
      [6, 3],
    ]);
    ok([
      [4, 6],
      [7, 5],
      [7, 6],
    ]);
    ok([
      [0, 6],
      [0, 6],
    ]);
  });

  it("accepts a one-set match", () => {
    ok([[6, 2]]);
    ok([[6, 7]]);
  });

  it("accepts a match tiebreak as the deciding set", () => {
    ok([
      [6, 4],
      [3, 6],
      [10, 7],
    ]);
    ok([
      [6, 4],
      [3, 6],
      [12, 14],
    ]);
    ok([
      [6, 4],
      [3, 6],
      [10, 0],
    ]);
  });

  it("rejects sets that aren't finished or can't happen", () => {
    bad([[6, 5]]);
    bad([[5, 3]]);
    bad([[7, 3]]);
    bad([[8, 6]]);
    bad([[6, 6]]);
    bad([
      [6, 4],
      [6, -1],
    ]);
    bad([
      [6, 4],
      [6, 2.5],
    ]);
  });

  it("rejects a match tiebreak outside the deciding set or with a bad margin", () => {
    bad([[10, 7]]);
    bad([
      [6, 4],
      [10, 7],
    ]);
    bad([
      [6, 4],
      [3, 6],
      [10, 9],
    ]);
    bad([
      [6, 4],
      [3, 6],
      [13, 10],
    ]);
  });

  it("rejects matches with no winner, too many sets, or sets after the end", () => {
    bad([]);
    bad([
      [6, 4],
      [4, 6],
    ]);
    bad([
      [6, 4],
      [6, 4],
      [6, 4],
    ]);
    bad([
      [6, 4],
      [4, 6],
      [6, 4],
      [6, 4],
    ]);
  });
});

describe("winningSide", () => {
  it("is the side that took more sets", () => {
    expect(
      winningSide([
        [6, 4],
        [6, 3],
      ]),
    ).toBe("a");
    expect(
      winningSide([
        [6, 4],
        [3, 6],
        [7, 10],
      ]),
    ).toBe("b");
    expect(winningSide([[2, 6]])).toBe("b");
  });
});

describe("NewSessionResult", () => {
  const decode = Schema.decodeUnknownExit(NewSessionResult);
  const sets = [
    [6, 4],
    [6, 3],
  ];

  it("accepts singles and doubles sides", () => {
    expect(decode({ sideA: ["u1"], sideB: ["u2"], sets })._tag).toBe("Success");
    expect(decode({ sideA: ["u1", "u2"], sideB: ["u3", "u4"], sets })._tag).toBe("Success");
  });

  it("rejects uneven, empty, oversized or overlapping sides", () => {
    expect(decode({ sideA: ["u1"], sideB: ["u2", "u3"], sets })._tag).toBe("Failure");
    expect(decode({ sideA: [], sideB: [], sets })._tag).toBe("Failure");
    expect(decode({ sideA: ["a", "b", "c"], sideB: ["d", "e", "f"], sets })._tag).toBe("Failure");
    expect(decode({ sideA: ["u1"], sideB: ["u1"], sets })._tag).toBe("Failure");
    expect(decode({ sideA: ["u1", "u1"], sideB: ["u2", "u3"], sets })._tag).toBe("Failure");
  });
});

describe("NewSessionComment", () => {
  const decode = Schema.decodeUnknownExit(NewSessionComment);

  it("accepts 1 to 1000 trimmed characters", () => {
    expect(decode({ body: "Court 4, I'll bring balls" })._tag).toBe("Success");
    expect(decode({ body: "x".repeat(SESSION_COMMENT_MAX) })._tag).toBe("Success");
  });

  it("rejects empty, padded and long bodies", () => {
    expect(decode({ body: "" })._tag).toBe("Failure");
    expect(decode({ body: " hi" })._tag).toBe("Failure");
    expect(decode({ body: "x".repeat(SESSION_COMMENT_MAX + 1) })._tag).toBe("Failure");
  });
});
