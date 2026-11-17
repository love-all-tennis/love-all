import type { Session } from "@love-all/domain";

/**
 * What the signed-in player can do with a session from where they stand in
 * it: accept or decline an invite, ask to join, leave. The host's own Edit and
 * Invite buttons sit at the end of the detail screen.
 *
 * Empty until joining lands (#40); the detail screen already renders it under
 * the session's time.
 */
export function PlayerActions(_props: {
  session: Session;
  /** Reload the session after an action that answers with no content. */
  onChanged: () => void;
  /** Put in a session an action already returned. */
  onReplaced: (session: Session) => void;
}) {
  return null;
}
