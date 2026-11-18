import type { Session, SessionParticipant } from "@love-all/domain";
import { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import { Avatar, Button, Card, ErrorBanner, space, Text } from "@/design";
import { levelLabel } from "../players/components";
import { Section } from "./components";
import {
  applyChange,
  cancelPrompt,
  isOptimistic,
  pendingRequests,
  viewerAction,
  type JoinChange,
  type JoinFacts,
} from "./joining";
import { sendJoinChange } from "./joining-api";

/** Asks before cancelling, since players can't undo it. Named for the action, never "OK". */
export const confirmCancel = (session: JoinFacts, onConfirm: () => void) => {
  const { title, body } = cancelPrompt(session);
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: "Keep session", style: "cancel" },
    { text: "Cancel session", style: "destructive", onPress: onConfirm },
  ]);
};

/** The change in flight, if any. */
export type PendingChange = JoinChange | null;

export type JoinChanges = {
  readonly pending: PendingChange;
  /** What the server said no with, or a connection problem. */
  readonly notice: string | null;
  readonly run: (change: JoinChange) => void;
};

/**
 * Runs join changes for the session on the detail screen. Safe changes show
 * at once and roll back if the server says no; accepting and approving wait
 * for the server, which may say the last spot just went. Every change that
 * reaches the server ends with `reload`, so the screen shows what it holds.
 */
export const useJoinChanges = ({
  session,
  myId,
  replace,
  reload,
}: {
  session: Session;
  myId: string | undefined;
  /** Shows a session in place, with no request. */
  replace: (next: Session) => void;
  reload: () => void;
}) => {
  const [pending, setPending] = useState<PendingChange>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);

  const run = async (change: JoinChange) => {
    if (running.current) return;
    running.current = true;
    const before = session;
    setPending(change);
    setNotice(null);
    if (myId && isOptimistic(change)) replace(applyChange(session, change, myId));
    try {
      const refusal = await sendJoinChange(session.id, change);
      if (refusal) {
        replace(before);
        setNotice(refusal);
      }
      reload();
    } catch {
      replace(before);
      setNotice("Couldn't update this session. Check your connection and try again.");
    } finally {
      running.current = false;
      setPending(null);
    }
  };

  return { pending, notice, run: (change) => void run(change) } satisfies JoinChanges;
};

const isPending = (pending: PendingChange, kind: JoinChange["kind"], userId?: string) =>
  pending?.kind === kind &&
  (userId === undefined || ("userId" in pending && pending.userId === userId));

/**
 * The join action for where I stand, under the session's time: Accept and
 * Decline for an invite, Ask to join, a pending request I can withdraw, or
 * Leave. The host's Cancel sits with Edit at the end of the screen.
 */
export function SessionJoinActions({
  session,
  now,
  changes: { pending, notice, run },
}: {
  session: Session;
  now: Date;
  changes: JoinChanges;
}) {
  const action = viewerAction(session, now);
  const busy = pending !== null;
  const host = session.host.displayName;
  const body = (() => {
    switch (action.kind) {
      case "answerInvite":
        return (
          <>
            <Text color="textMuted">
              {action.full
                ? `${host} invited you, but every spot is taken right now.`
                : `${host} invited you. Accepting takes a spot.`}
            </Text>
            <View style={styles.stack}>
              {action.full ? null : (
                <Button
                  label="Accept invite"
                  onPress={() => run({ kind: "accept" })}
                  loading={isPending(pending, "accept")}
                  disabled={busy}
                />
              )}
              <Button
                label="Decline invite"
                variant="secondary"
                onPress={() => run({ kind: "decline" })}
                loading={isPending(pending, "decline")}
                disabled={busy}
              />
            </View>
          </>
        );
      case "askToJoin":
        return (
          <>
            <Text color="textMuted">{`${host} gets your request and decides who plays.`}</Text>
            <Button
              label="Ask to join"
              onPress={() => run({ kind: "request" })}
              loading={isPending(pending, "request")}
              disabled={busy}
            />
          </>
        );
      case "requested":
        return (
          <>
            <Text color="textMuted">{`Requested. Waiting on ${host} to answer.`}</Text>
            <Button
              label="Withdraw request"
              variant="secondary"
              onPress={() => run({ kind: "leave" })}
              loading={isPending(pending, "leave")}
              disabled={busy}
            />
          </>
        );
      case "leave":
        return (
          <>
            <Text color="textMuted">You're playing. Can't make it? Leave so someone else can.</Text>
            <Button
              label="Leave session"
              variant="secondary"
              onPress={() => run({ kind: "leave" })}
              loading={isPending(pending, "leave")}
              disabled={busy}
              accessibilityHint="Gives up your spot so someone else can take it"
            />
          </>
        );
      case "host":
        return null;
      case "none":
        return action.note ? <Text color="textMuted">{action.note}</Text> : null;
    }
  })();

  if (!body && !notice) return null;
  return (
    <View style={styles.actions}>
      <ErrorBanner>{notice}</ErrorBanner>
      {body}
    </View>
  );
}

/** The host's Cancel session, with a confirm step. */
export function CancelSessionButton({
  session,
  changes: { pending, run },
}: {
  session: Session;
  changes: JoinChanges;
}) {
  return (
    <Button
      label="Cancel session"
      variant="quiet"
      onPress={() => confirmCancel(session, () => run({ kind: "cancel" }))}
      loading={isPending(pending, "cancel")}
      disabled={pending !== null}
    />
  );
}

/** For the host: players who asked to join, each with Approve and Decline. */
export function JoinRequests({
  session,
  now,
  changes: { pending, run },
  onOpenPlayer,
}: {
  session: Session;
  now: Date;
  changes: JoinChanges;
  onOpenPlayer: (id: string) => void;
}) {
  if (viewerAction(session, now).kind !== "host") return null;
  const requests = pendingRequests(session);
  if (requests.length === 0) return null;
  const full = session.acceptedCount >= session.spots;
  return (
    <Section
      label="Asked to join"
      hint={
        full
          ? "Every spot is taken. Someone has to leave before you approve."
          : "Approving gives them a spot."
      }
    >
      {requests.map((p) => (
        <RequestRow
          key={p.player.id}
          participant={p}
          pending={pending}
          full={full}
          run={run}
          onOpenPlayer={onOpenPlayer}
        />
      ))}
    </Section>
  );
}

function RequestRow({
  participant: { player },
  pending,
  full,
  run,
  onOpenPlayer,
}: {
  participant: SessionParticipant;
  pending: PendingChange;
  full: boolean;
  run: (change: JoinChange) => void;
  onOpenPlayer: (id: string) => void;
}) {
  const busy = pending !== null;
  return (
    <Card style={styles.request}>
      <View style={styles.row}>
        <Avatar name={player.displayName} photoUrl={player.photoUrl} />
        <View style={styles.fill}>
          <Text variant="subheading" numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
            {levelLabel(player.ntrp)}
          </Text>
        </View>
        <Button
          label="Profile"
          variant="quiet"
          size="small"
          onPress={() => onOpenPlayer(player.id)}
          accessibilityHint={`Opens ${player.displayName}'s profile`}
        />
      </View>
      <View style={styles.buttons}>
        {full ? null : (
          <Button
            label="Approve"
            variant="secondary"
            size="small"
            onPress={() => run({ kind: "approve", userId: player.id })}
            loading={isPending(pending, "approve", player.id)}
            disabled={busy}
            accessibilityHint={`Gives ${player.displayName} a spot`}
          />
        )}
        <Button
          label="Decline"
          variant="quiet"
          size="small"
          onPress={() => run({ kind: "reject", userId: player.id })}
          loading={isPending(pending, "reject", player.id)}
          disabled={busy}
          accessibilityHint={`Turns down ${player.displayName}'s request`}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space[3] },
  stack: { gap: space[2] },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  fill: { flex: 1 },
  request: { gap: space[3] },
});
