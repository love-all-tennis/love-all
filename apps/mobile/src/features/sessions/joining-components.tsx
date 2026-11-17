import type { Session, SessionParticipant } from "@love-all/domain";
import { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import { Avatar, Button, Card, ErrorBanner, space, Tag, Text } from "@/design";
import { levelLabel } from "../players/components";
import {
  applyChange,
  cancelPrompt,
  isOptimistic,
  pendingRequests,
  statusTag,
  viewerAction,
  type JoinChange,
  type JoinFacts,
} from "./joining";
import { sendJoinChange } from "./joining-api";

/** When the screen opened: "now" for working out whether a session has started. */
const useOpenedAt = (): Date => useState(() => new Date())[0];

/** Open with N spots left, confirmed or cancelled, as a tag. */
export function SessionStatusTag({ session, now }: { session: JoinFacts; now?: Date }) {
  const opened = useOpenedAt();
  const tag = statusTag(session, now ?? opened);
  return <Tag label={tag.label} tone={tag.tone} />;
}

/** Asks before cancelling, since players can't undo it. Named for the action, never "OK". */
export const confirmCancel = (session: JoinFacts, onConfirm: () => void): void => {
  const { title, body } = cancelPrompt(session);
  if (Platform.OS === "web") {
    // react-native-web has no Alert.
    if (globalThis.confirm?.(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: "Keep session", style: "cancel" },
    { text: "Cancel session", style: "destructive", onPress: onConfirm },
  ]);
};

/** What's in flight: the change, and for approve/reject, whose request. */
export type PendingChange = JoinChange | null;

/**
 * Runs join changes for the session shown on a detail screen. Safe changes
 * show at once and roll back if the server says no; accepting and approving
 * wait for the server, which may say the last spot just went. Every change
 * ends with `reload`, so the screen shows what the server holds.
 */
export const useJoinChanges = ({
  session,
  myId,
  setSession,
  reload,
}: {
  session: Session;
  myId: string;
  setSession: (next: Session) => void;
  reload: () => Promise<void> | void;
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
    if (isOptimistic(change)) setSession(applyChange(session, change, myId));
    try {
      const refusal = await sendJoinChange(session.id, change);
      if (refusal) {
        setSession(before);
        setNotice(refusal);
      }
      await reload();
    } catch {
      setSession(before);
      setNotice("Couldn't update this session. Check your connection and try again.");
    } finally {
      running.current = false;
      setPending(null);
    }
  };

  return { pending, notice, run };
};

const isPending = (pending: PendingChange, kind: JoinChange["kind"], userId?: string) =>
  pending?.kind === kind &&
  (userId === undefined || ("userId" in pending && pending.userId === userId));

/**
 * The detail screen's join action for where I stand: Accept and Decline for
 * an invite, Ask to join, Requested, Leave, or Cancel session for the host.
 * Accept and Ask to join are the screen's primary action; leaving and
 * cancelling are quieter so they aren't hit by mistake.
 */
export function SessionJoinActions({
  session,
  pending,
  notice,
  run,
  now,
}: {
  session: Session;
  pending: PendingChange;
  notice: string | null;
  run: (change: JoinChange) => void;
  now?: Date;
}) {
  const opened = useOpenedAt();
  const action = viewerAction(session, now ?? opened);
  const busy = pending !== null;
  const body = (() => {
    switch (action.kind) {
      case "answerInvite":
        return (
          <>
            <Text variant="subheading">{`${session.host.displayName} invited you`}</Text>
            {action.full ? (
              <Text color="textMuted">Every spot is taken, so you can't accept right now.</Text>
            ) : null}
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
            <Text color="textMuted">
              {`${session.host.displayName} gets your request and decides who plays.`}
            </Text>
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
            <View style={styles.row}>
              <Tag label="Requested" tone="clay" />
              <Text color="textMuted" style={styles.flex}>
                {`Waiting on ${session.host.displayName}.`}
              </Text>
            </View>
            <Button
              label="Withdraw request"
              variant="quiet"
              onPress={() => run({ kind: "leave" })}
              loading={isPending(pending, "leave")}
              disabled={busy}
            />
          </>
        );
      case "leave":
        return (
          <>
            <View style={styles.row}>
              <Tag label="You're in" tone="accent" />
            </View>
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
        return (
          <Button
            label="Cancel session"
            variant="quiet"
            onPress={() => confirmCancel(session, () => run({ kind: "cancel" }))}
            loading={isPending(pending, "cancel")}
            disabled={busy}
          />
        );
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

/** For the host: players who asked to join, each with Approve and Decline. */
export function JoinRequests({
  session,
  pending,
  run,
  onOpenPlayer,
  now,
}: {
  session: Session;
  pending: PendingChange;
  run: (change: JoinChange) => void;
  onOpenPlayer: (id: string) => void;
  now?: Date;
}) {
  const opened = useOpenedAt();
  if (viewerAction(session, now ?? opened).kind !== "host") return null;
  const requests = pendingRequests(session);
  if (requests.length === 0) return null;
  const full = session.acceptedCount >= session.spots;
  return (
    <View style={styles.requests}>
      <Text variant="heading" accessibilityRole="header">
        Asked to join
      </Text>
      {full ? (
        <Text color="textMuted">Every spot is taken. Approving needs someone to leave first.</Text>
      ) : null}
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
    </View>
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
  const level = levelLabel(player.ntrp);
  return (
    <Card style={styles.request}>
      <View style={styles.row}>
        <Avatar name={player.displayName} photoUrl={player.photoUrl} />
        <View style={styles.flex}>
          <Text variant="subheading" numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text variant="caption" color="textMuted" tabular numberOfLines={1}>
            {level}
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
            size="small"
            onPress={() => run({ kind: "approve", userId: player.id })}
            loading={isPending(pending, "approve", player.id)}
            disabled={busy}
            accessibilityHint={`Gives ${player.displayName} a spot`}
          />
        )}
        <Button
          label="Decline"
          variant="secondary"
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
  flex: { flex: 1 },
  requests: { gap: space[3] },
  request: { gap: space[3] },
});
