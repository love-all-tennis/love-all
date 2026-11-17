import type { Session, SessionComment, SessionResult } from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  ErrorBanner,
  space,
  Tag,
  Text,
  TextField,
  type TagTone,
} from "@/design";
import {
  deleteComment,
  fetchComments,
  fetchResult,
  postComment,
  respondToResult,
} from "./activity-api";
import { commentError, mergeComments, timeAgo } from "./comments";
import { canRecordScore, resultView } from "./score";

const NETWORK = "Check your connection and try again.";

/** Asks before something that can't be undone, on native and web. */
const confirmDestructive = (title: string, message: string, action: string, run: () => void) => {
  if (Platform.OS === "web") {
    // react-native-web has no Alert.
    if (globalThis.confirm?.(`${title}\n\n${message}`)) run();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, style: "destructive", onPress: run },
  ]);
};

type CommentsState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly items: ReadonlyArray<SessionComment>;
      readonly cursor: string | null;
    };

/**
 * Logistics notes on a session, for the host and accepted players: oldest
 * first, a box to add one, and Delete on my own.
 */
export function SessionComments({
  sessionId,
  meId,
  closed,
}: {
  sessionId: string;
  meId: string | null;
  /** Cancelled sessions show their comments but take no new ones. */
  closed: boolean;
}) {
  const [state, setState] = useState<CommentsState>({ status: "loading" });
  const [generation, setGeneration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // "5 min ago" is measured from when the section opened; a new comment reads "Just now".
  const [now] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    fetchComments(sessionId)
      .then(
        (page) => live && setState({ status: "ready", items: page.items, cursor: page.nextCursor }),
      )
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [sessionId, generation]);

  const loadMore = async () => {
    if (state.status !== "ready" || !state.cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchComments(sessionId, state.cursor);
      setState((s) =>
        s.status === "ready"
          ? { ...s, items: mergeComments(s.items, page.items), cursor: page.nextCursor }
          : s,
      );
    } catch {
      setProblem(`Couldn't load more comments. ${NETWORK}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const error = tried ? commentError(draft) : null;

  const send = async () => {
    setTried(true);
    if (commentError(draft)) return;
    setPosting(true);
    setProblem(null);
    try {
      const outcome = await postComment(sessionId, draft.trim());
      if ("refusal" in outcome) {
        setProblem(outcome.refusal);
        return;
      }
      setDraft("");
      setTried(false);
      setState((s) =>
        s.status === "ready" ? { ...s, items: mergeComments(s.items, [outcome.ok]) } : s,
      );
    } catch {
      setProblem(`Couldn't post your comment. ${NETWORK}`);
    } finally {
      setPosting(false);
    }
  };

  const remove = (comment: SessionComment) =>
    confirmDestructive(
      "Delete your comment?",
      "It's removed for everyone in the session.",
      "Delete",
      () => {
        setDeleting(comment.id);
        setProblem(null);
        deleteComment(comment.id)
          .then((outcome) => {
            if ("refusal" in outcome) setProblem(outcome.refusal);
            else
              setState((s) =>
                s.status === "ready"
                  ? { ...s, items: s.items.filter((c) => c.id !== comment.id) }
                  : s,
              );
          })
          .catch(() => setProblem(`Couldn't delete your comment. ${NETWORK}`))
          .finally(() => setDeleting(null));
      },
    );

  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        Comments
      </Text>
      {state.status === "loading" ? (
        <Text color="textMuted">Loading comments…</Text>
      ) : state.status === "error" ? (
        <View style={styles.group}>
          <Text color="textMuted">Couldn't load comments. {NETWORK}</Text>
          <Button
            label="Try again"
            variant="secondary"
            size="small"
            onPress={() => {
              setState({ status: "loading" });
              setGeneration((g) => g + 1);
            }}
          />
        </View>
      ) : (
        <View style={styles.group}>
          {state.items.length === 0 && (
            <Text color="textMuted">
              No comments yet. Share the court number or who's bringing balls.
            </Text>
          )}
          {state.items.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              mine={comment.author.id === meId}
              when={timeAgo(comment.createdAt, now)}
              deleting={deleting === comment.id}
              onDelete={() => remove(comment)}
            />
          ))}
          {state.cursor && (
            <Button
              label="Show more comments"
              variant="quiet"
              size="small"
              loading={loadingMore}
              onPress={() => void loadMore()}
            />
          )}
        </View>
      )}
      <ErrorBanner>{problem}</ErrorBanner>
      {!closed && (
        <View style={styles.group}>
          <TextField
            label="Add a comment"
            placeholder="Court 4, I'll bring balls"
            value={draft}
            onChangeText={setDraft}
            error={error ?? undefined}
            multiline
            maxLength={1100}
          />
          <Button
            label="Post comment"
            variant="secondary"
            loading={posting}
            onPress={() => void send()}
          />
        </View>
      )}
    </View>
  );
}

function CommentRow({
  comment,
  mine,
  when,
  deleting,
  onDelete,
}: {
  comment: SessionComment;
  mine: boolean;
  when: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <Card style={styles.comment}>
      <Avatar name={comment.author.displayName} photoUrl={comment.author.photoUrl} size="sm" />
      <View style={styles.commentText}>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {mine ? "You" : comment.author.displayName} · {when}
        </Text>
        <Text>{comment.body}</Text>
        {mine && (
          <View style={styles.commentAction}>
            <Button
              label="Delete"
              variant="quiet"
              size="small"
              loading={deleting}
              onPress={onDelete}
            />
          </View>
        )}
      </View>
    </Card>
  );
}

const statusTag: Record<SessionResult["status"], { label: string; tone: TagTone }> = {
  pending: { label: "Pending", tone: "clay" },
  confirmed: { label: "Confirmed", tone: "accent" },
  disputed: { label: "Disputed", tone: "danger" },
};

type ResultState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly result: SessionResult | null };

/** The session's score, reloaded whenever the screen comes back into view. */
export function useSessionResult(sessionId: string, enabled: boolean) {
  const [state, setState] = useState<ResultState>({ status: "loading" });
  const reload = useCallback(() => {
    if (!enabled) return () => {};
    let live = true;
    fetchResult(sessionId)
      .then((result) => live && setState({ status: "ready", result }))
      .catch(() => live && setState((s) => (s.status === "ready" ? s : { status: "error" })));
    return () => {
      live = false;
    };
  }, [sessionId, enabled]);
  useFocusEffect(reload);
  return { state, setState, reload };
}

/**
 * The score block on a singles or doubles session: Record score once it has
 * started, the score with its state, and Confirm or Dispute for the other side.
 */
export function SessionScore({
  session,
  meId,
  onRecord,
}: {
  session: Session;
  meId: string | null;
  /** Opens score entry. */
  onRecord: () => void;
}) {
  const enabled = session.kind !== "hitting" && session.me?.state === "accepted";
  const { state, setState, reload } = useSessionResult(session.id, enabled);
  const [busy, setBusy] = useState<"confirm" | "dispute" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  if (!enabled) return null;
  const recordable = canRecordScore(session, now);
  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Score
        </Text>
        <Text color="textMuted">Couldn't load the score. {NETWORK}</Text>
        <Button label="Try again" variant="secondary" size="small" onPress={() => void reload()} />
      </View>
    );
  }

  const result = state.result;
  if (!result) {
    if (!recordable) return null;
    return (
      <View style={styles.section}>
        <Text variant="heading" accessibilityRole="header">
          Score
        </Text>
        <Text color="textMuted">Record how it went. The other side confirms it.</Text>
        <Button label="Record score" variant="secondary" onPress={onRecord} />
      </View>
    );
  }

  const players = session.participants.map((p) => p.player);
  const view = resultView(result, players, meId);
  const tag = statusTag[view.status];

  const respond = async (response: "confirm" | "dispute") => {
    setBusy(response);
    setProblem(null);
    try {
      const outcome = await respondToResult(session.id, response);
      if ("refusal" in outcome) setProblem(outcome.refusal);
      else setState({ status: "ready", result: outcome.ok });
    } catch {
      setProblem(`Couldn't send your answer. ${NETWORK}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        Score
      </Text>
      <Card style={styles.group}>
        <View style={styles.scoreHead}>
          <Text variant="subheading" tabular style={styles.flex}>
            {view.headline}
          </Text>
          <Tag label={tag.label} tone={tag.tone} />
        </View>
        <Text variant="caption" color="textMuted">
          {view.detail}
        </Text>
        {view.canRespond && (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button
                label="Confirm score"
                size="small"
                loading={busy === "confirm"}
                onPress={() => void respond("confirm")}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Dispute"
                variant="secondary"
                size="small"
                loading={busy === "dispute"}
                onPress={() =>
                  confirmDestructive(
                    "Dispute this score?",
                    "It won't count, and either side can record it again.",
                    "Dispute",
                    () => void respond("dispute"),
                  )
                }
              />
            </View>
          </View>
        )}
        {view.canRerecord && recordable && (
          <Button
            label="Record the score again"
            variant="secondary"
            size="small"
            onPress={onRecord}
          />
        )}
      </Card>
      <ErrorBanner>{problem}</ErrorBanner>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[3] },
  group: { gap: space[2] },
  comment: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  commentText: { flex: 1, gap: space[1] },
  commentAction: { alignSelf: "flex-start" },
  scoreHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  row: { flexDirection: "row", gap: space[2] },
  flex: { flex: 1 },
});
