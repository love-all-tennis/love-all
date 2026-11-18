import {
  FORUM_TITLE_MAX,
  ForumCategory,
  ForumPost,
  type ForumReactionCount,
} from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import {
  asDeleted,
  bodyError,
  lengthHint,
  localHeading,
  mergeById,
  postMenuActions,
  reactionChipLabel,
  replyCountLabel,
  splitCategories,
  titleError,
  toggleReaction,
} from "./forum";

const reactions: ReadonlyArray<ForumReactionCount> = [
  { kind: "like", count: 2, mine: false },
  { kind: "helpful", count: 1, mine: true },
  { kind: "ace", count: 0, mine: false },
];

const category = (name: string, metroId: string | null) =>
  new ForumCategory({
    id: crypto.randomUUID(),
    slug: name.toLowerCase(),
    name,
    metroId,
    latestThread: null,
  });

describe("reactions", () => {
  it("labels chips with their count once someone reacted", () => {
    expect(reactionChipLabel(reactions[0]!)).toBe("Like 2");
    expect(reactionChipLabel(reactions[2]!)).toBe("Ace");
  });

  it("toggles my reaction on and off with the count", () => {
    const on = toggleReaction(reactions, "like");
    expect(on.on).toBe(true);
    expect(on.reactions[0]).toEqual({ kind: "like", count: 3, mine: true });
    const off = toggleReaction(reactions, "helpful");
    expect(off.on).toBe(false);
    expect(off.reactions[1]).toEqual({ kind: "helpful", count: 0, mine: false });
    expect(off.reactions[0]).toBe(reactions[0]);
  });
});

describe("categories", () => {
  it("puts the Local category in its own group and names it by metro", () => {
    const local = category("Detroit Local", "m1");
    const { local: mine, global } = splitCategories([local, category("General", null)]);
    expect(mine).toEqual([local]);
    expect(global.map((c) => c.name)).toEqual(["General"]);
    expect(localHeading(local)).toBe("Detroit");
    expect(localHeading(category("Local", "m2"))).toBe("Local");
  });
});

describe("validation", () => {
  it("needs a title and text within the limits", () => {
    expect(titleError("  ")).toBe("Write a title first");
    expect(titleError("Strings?")).toBeNull();
    expect(titleError("x".repeat(FORUM_TITLE_MAX + 1))).toBe(
      `Keep the title to ${FORUM_TITLE_MAX} characters (${FORUM_TITLE_MAX + 1} now)`,
    );
    expect(bodyError("", "reply")).toBe("Write a reply first");
    expect(bodyError("Poly")).toBeNull();
    expect(lengthHint(" Strings? ", FORUM_TITLE_MAX)).toBe(`8 / ${FORUM_TITLE_MAX}`);
  });
});

describe("lists", () => {
  it("merges pages without repeats", () => {
    expect(mergeById([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }])).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ]);
  });

  it("counts replies in words", () => {
    expect(replyCountLabel(0)).toBe("No replies yet");
    expect(replyCountLabel(1)).toBe("1 reply");
    expect(replyCountLabel(4)).toBe("4 replies");
  });

  it("offers delete on my posts and report on others', nothing on deleted ones", () => {
    expect(postMenuActions("me", "me")).toEqual(["delete"]);
    expect(postMenuActions("sam", "me")).toEqual(["report"]);
    expect(postMenuActions(null, "me")).toEqual([]);
  });
});

describe("deleting a reply", () => {
  it("looks like the API's deleted placeholder", () => {
    const post = new ForumPost({
      id: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      deleted: false,
      body: "Oops",
      author: { id: "me", displayName: "Me", photoUrl: null },
      createdAt: new Date(),
      reactions,
    });
    const gone = asDeleted(post);
    expect(gone).toBeInstanceOf(ForumPost);
    expect(gone).toMatchObject({ id: post.id, deleted: true, body: null, author: null });
    expect(gone.reactions.every((r) => r.count === 0 && !r.mine)).toBe(true);
  });
});
