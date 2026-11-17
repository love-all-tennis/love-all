/**
 * Who the host can invite, kept free of React Native so it can be unit
 * tested.
 */

import { MAX_INVITES_PER_REQUEST, type Ntrp, type Session } from "@love-all/domain";

export type InviteCandidate = {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly ntrp: Ntrp | null;
  readonly distanceKm: number | null;
};

/**
 * People I follow, then nearby players I don't follow, leaving out me and
 * anyone already in the session (invited, asked to join, or playing). Players
 * who declined or left can be asked again.
 */
export const inviteCandidates = ({
  session,
  myId,
  followed,
  nearby,
}: {
  session: Session;
  myId: string;
  followed: ReadonlyArray<InviteCandidate>;
  nearby: ReadonlyArray<InviteCandidate>;
}): {
  readonly followed: ReadonlyArray<InviteCandidate>;
  readonly nearby: ReadonlyArray<InviteCandidate>;
} => {
  const taken = new Set([
    myId,
    ...session.participants
      .filter((p) => p.state !== "declined" && p.state !== "left")
      .map((p) => p.player.id),
  ]);
  const keptFollowed = followed.filter((p) => !taken.has(p.id));
  const followedIds = new Set(keptFollowed.map((p) => p.id));
  return {
    followed: keptFollowed,
    nearby: nearby.filter((p) => !taken.has(p.id) && !followedIds.has(p.id)),
  };
};

/**
 * Picks or unpicks a player. Past the per-request limit, the same array comes
 * back unchanged, so the screen can say why.
 */
export const toggleInvite = (picked: ReadonlyArray<string>, id: string): ReadonlyArray<string> => {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= MAX_INVITES_PER_REQUEST) return picked;
  return [...picked, id];
};
