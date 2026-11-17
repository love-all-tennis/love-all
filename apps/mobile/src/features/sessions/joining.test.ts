import { describe, expect, it } from "vite-plus/test";
import {
  applyChange,
  cancelPrompt,
  groupMySessions,
  isOptimistic,
  myPlaceTag,
  needsMyAnswer,
  pendingRequests,
  statusTag,
  viewerAction,
  type JoinDetail,
  type JoinFacts,
} from "./joining";

const now = new Date("2026-11-20T12:00:00Z");
const later = new Date("2026-11-22T14:00:00Z");

const facts = (fields: Partial<JoinFacts> = {}): JoinFacts => ({
  status: "open",
  startsAt: later,
  visibility: "open",
  spots: 2,
  acceptedCount: 1,
  requestCount: 0,
  me: null,
  ...fields,
});

const player = { role: "player" } as const;

describe("viewerAction", () => {
  it("lets an invited player accept or decline", () => {
    expect(viewerAction(facts({ me: { ...player, state: "invited" } }), now)).toEqual({
      kind: "answerInvite",
      full: false,
    });
  });

  it("marks an invite whose spots are all taken as full", () => {
    expect(
      viewerAction(facts({ acceptedCount: 2, me: { ...player, state: "invited" } }), now),
    ).toEqual({ kind: "answerInvite", full: true });
  });

  it("offers Ask to join on an open session with a spot, even after leaving", () => {
    expect(viewerAction(facts(), now)).toEqual({ kind: "askToJoin" });
    expect(viewerAction(facts({ me: { ...player, state: "left" } }), now)).toEqual({
      kind: "askToJoin",
    });
  });

  it("shows Requested while the host decides", () => {
    expect(viewerAction(facts({ me: { ...player, state: "requested" } }), now)).toEqual({
      kind: "requested",
    });
  });

  it("lets an accepted player leave, and the host cancel", () => {
    expect(viewerAction(facts({ me: { ...player, state: "accepted" } }), now)).toEqual({
      kind: "leave",
    });
    expect(viewerAction(facts({ me: { role: "host", state: "accepted" } }), now)).toEqual({
      kind: "host",
    });
  });

  it("offers nothing on a full, invite-only or declined session, and says why", () => {
    expect(viewerAction(facts({ acceptedCount: 2, status: "confirmed" }), now)).toEqual({
      kind: "none",
      note: "Every spot is taken.",
    });
    expect(viewerAction(facts({ visibility: "invite_only" }), now)).toEqual({
      kind: "none",
      note: "This session is invite only.",
    });
    expect(
      viewerAction(facts({ visibility: "invite_only", me: { ...player, state: "left" } }), now),
    ).toEqual({ kind: "none", note: "You left this session. It's invite only." });
    expect(viewerAction(facts({ me: { ...player, state: "declined" } }), now)).toEqual({
      kind: "none",
      note: "You're not playing in this session.",
    });
  });

  it("offers nothing once a session is cancelled or has started, host included", () => {
    const host = { role: "host", state: "accepted" } as const;
    expect(viewerAction(facts({ status: "cancelled", me: host }), now)).toEqual({
      kind: "none",
      note: "This session was cancelled.",
    });
    expect(viewerAction(facts({ startsAt: now, me: host }), now)).toEqual({
      kind: "none",
      note: "This session has already started.",
    });
  });
});

describe("statusTag", () => {
  it("counts the spots left on an open session", () => {
    expect(statusTag(facts(), now)).toEqual({ label: "Open · 1 spot left", tone: "highlight" });
    expect(statusTag(facts({ spots: 4 }), now)).toEqual({
      label: "Open · 3 spots left",
      tone: "highlight",
    });
  });

  it("reads confirmed, cancelled and past sessions", () => {
    expect(statusTag(facts({ status: "confirmed", acceptedCount: 2 }), now)).toEqual({
      label: "Confirmed",
      tone: "accent",
    });
    expect(statusTag(facts({ status: "cancelled" }), now)).toEqual({
      label: "Cancelled",
      tone: "danger",
    });
    expect(statusTag(facts({ status: "confirmed", startsAt: now }), now).label).toBe("Played");
    expect(statusTag(facts({ startsAt: now }), now).label).toBe("Started");
  });
});

describe("Needs your answer", () => {
  const invite = facts({ me: { ...player, state: "invited" } });
  const requests = facts({ me: { role: "host", state: "accepted" }, requestCount: 2 });

  it("holds my invites and, for hosts, sessions with requests", () => {
    expect(needsMyAnswer(invite, now)).toBe(true);
    expect(needsMyAnswer(requests, now)).toBe(true);
    expect(needsMyAnswer(facts({ me: { role: "host", state: "accepted" } }), now)).toBe(false);
    expect(needsMyAnswer(facts({ me: { ...player, state: "accepted" } }), now)).toBe(false);
  });

  it("leaves out cancelled and past sessions", () => {
    expect(needsMyAnswer({ ...invite, status: "cancelled" }, now)).toBe(false);
    expect(needsMyAnswer({ ...requests, startsAt: now }, now)).toBe(false);
  });

  it("splits My sessions, soonest answer first, and keeps the rest in order", () => {
    const soon = { ...invite, startsAt: new Date("2026-11-21T09:00:00Z") };
    const mine = facts({ me: { ...player, state: "accepted" } });
    const past = facts({ startsAt: new Date("2026-11-01T09:00:00Z") });
    expect(groupMySessions([mine, requests, soon, past], now)).toEqual({
      needsAnswer: [soon, requests],
      rest: [mine, past],
    });
  });

  it("tags rows with my invite, my request, or the host's request count", () => {
    expect(myPlaceTag(invite, now)).toEqual({ label: "Invited", tone: "neutral" });
    expect(myPlaceTag(facts({ me: { ...player, state: "requested" } }), now)?.label).toBe(
      "Requested",
    );
    expect(myPlaceTag(requests, now)?.label).toBe("2 requests");
    expect(myPlaceTag({ ...requests, requestCount: 1 }, now)?.label).toBe("1 request");
    expect(myPlaceTag(facts({ me: { ...player, state: "accepted" } }), now)).toBeNull();
  });
});

describe("applyChange", () => {
  const detail = (fields: Partial<JoinDetail> = {}): JoinDetail => ({
    ...facts(),
    host: { id: "host" },
    participants: [
      { player: { id: "host" }, state: "accepted" },
      { player: { id: "me" }, state: "invited" },
    ],
    me: { ...player, state: "invited" },
    ...fields,
  });

  it("takes a spot on accept, and confirms the session once full", () => {
    const after = applyChange(detail(), { kind: "accept" }, "me");
    expect(after).toMatchObject({
      acceptedCount: 2,
      status: "confirmed",
      me: { state: "accepted" },
    });
    expect(after.participants[1]?.state).toBe("accepted");
  });

  it("gives the spot back on leave and reopens the session", () => {
    const accepted = detail({
      acceptedCount: 2,
      status: "confirmed",
      me: { ...player, state: "accepted" },
      participants: [
        { player: { id: "host" }, state: "accepted" },
        { player: { id: "me" }, state: "accepted" },
      ],
    });
    expect(applyChange(accepted, { kind: "leave" }, "me")).toMatchObject({
      acceptedCount: 1,
      status: "open",
      me: { state: "left" },
    });
  });

  it("withdraws a request without touching the spots", () => {
    const requested = detail({ me: { ...player, state: "requested" } });
    expect(applyChange(requested, { kind: "leave" }, "me")).toMatchObject({
      acceptedCount: 1,
      me: { state: "left" },
    });
  });

  it("marks a new request as mine", () => {
    expect(applyChange(detail({ me: null }), { kind: "request" }, "me").me).toEqual({
      role: "player",
      state: "requested",
    });
  });

  it("lets the host approve or reject a request", () => {
    const hosted = detail({
      me: { role: "host", state: "accepted" },
      spots: 4,
      requestCount: 2,
      participants: [
        { player: { id: "host" }, state: "accepted" },
        { player: { id: "a" }, state: "requested" },
        { player: { id: "b" }, state: "requested" },
      ],
    });
    const approved = applyChange(hosted, { kind: "approve", userId: "a" }, "host");
    expect(approved).toMatchObject({ acceptedCount: 2, requestCount: 1, status: "open" });
    expect(pendingRequests(approved).map((p) => p.player.id)).toEqual(["b"]);
    const rejected = applyChange(approved, { kind: "reject", userId: "b" }, "host");
    expect(rejected.requestCount).toBe(0);
    expect(pendingRequests(rejected)).toEqual([]);
  });

  it("cancels, and keeps a cancelled session cancelled", () => {
    const cancelled = applyChange(detail(), { kind: "cancel" }, "host");
    expect(cancelled.status).toBe("cancelled");
  });

  it("only shows changes that can't lose a race for the last spot before the server answers", () => {
    expect(isOptimistic({ kind: "accept" })).toBe(false);
    expect(isOptimistic({ kind: "approve", userId: "a" })).toBe(false);
    expect(isOptimistic({ kind: "decline" })).toBe(true);
    expect(isOptimistic({ kind: "request" })).toBe(true);
    expect(isOptimistic({ kind: "leave" })).toBe(true);
    expect(isOptimistic({ kind: "reject", userId: "a" })).toBe(true);
    expect(isOptimistic({ kind: "cancel" })).toBe(true);
  });
});

describe("cancelPrompt", () => {
  it("says who will see the session is off", () => {
    expect(cancelPrompt(facts({ acceptedCount: 1 })).body).toBe(
      "Anyone invited will see it's off. You can't undo this.",
    );
    expect(cancelPrompt(facts({ acceptedCount: 2 })).body).toBe(
      "The other player will see it's off. You can't undo this.",
    );
    expect(cancelPrompt(facts({ acceptedCount: 4 })).body).toBe(
      "The 3 other players will see it's off. You can't undo this.",
    );
  });
});
