import {
  MAX_INVITES_PER_REQUEST,
  Session,
  SessionParticipant,
  SessionPlayer,
} from "@love-all/domain";
import { describe, expect, it } from "vite-plus/test";
import { inviteCandidates, toggleInvite, type InviteCandidate } from "./invites";

const id = () => crypto.randomUUID();

const person = (name: string) =>
  ({
    id: id(),
    displayName: name,
    photoUrl: null,
    ntrp: "3.5",
    distanceKm: 4,
  }) satisfies InviteCandidate;

const me = person("Me");
const ana = person("Ana");
const ben = person("Ben");
const cy = person("Cy");
const dee = person("Dee");

const participant = (p: InviteCandidate, state: SessionParticipant["state"]) =>
  new SessionParticipant({
    player: new SessionPlayer({
      id: p.id,
      displayName: p.displayName,
      photoUrl: null,
      ntrp: p.ntrp,
    }),
    role: p === me ? "host" : "player",
    state,
  });

const session = new Session({
  id: id(),
  kind: "doubles",
  startsAt: new Date(2026, 10, 22, 9),
  durationMinutes: 90,
  courtName: "Palmer Park",
  courtPoint: null,
  levelMin: null,
  levelMax: null,
  spots: 4,
  acceptedCount: 1,
  requestCount: 0,
  visibility: "invite_only",
  status: "open",
  notes: null,
  host: participant(me, "accepted").player,
  me: { role: "host", state: "accepted" },
  distanceKm: null,
  participants: [
    participant(me, "accepted"),
    participant(ana, "invited"),
    participant(cy, "declined"),
  ],
  createdAt: new Date(2026, 10, 17),
});

describe("inviteCandidates", () => {
  it("leaves out me and players already in, keeps those who declined, and lists follows once", () => {
    const lists = inviteCandidates({
      session,
      myId: me.id,
      followed: [ana, ben],
      nearby: [me, ben, cy, dee],
    });

    expect(lists.followed.map((p) => p.displayName)).toEqual(["Ben"]);
    expect(lists.nearby.map((p) => p.displayName)).toEqual(["Cy", "Dee"]);
  });
});

describe("toggleInvite", () => {
  it("picks and unpicks", () => {
    expect(toggleInvite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleInvite(["a", "b"], "a")).toEqual(["b"]);
  });

  it("stops at the per-request limit", () => {
    const full = Array.from({ length: MAX_INVITES_PER_REQUEST }, (_, i) => String(i));
    expect(toggleInvite(full, "x")).toBe(full);
  });
});
