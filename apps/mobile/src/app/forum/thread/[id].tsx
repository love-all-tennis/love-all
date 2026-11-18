import {
  FORUM_BODY_MAX,
  type ForumAuthor,
  type ForumPost,
  type ForumReactionKind,
  type ForumThread,
} from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space, Text, TextField } from "@/design";
import { confirmDestructive, PostCard } from "@/features/forum/components";
import {
  bodyError,
  lengthHint,
  mergeById,
  postMenuActions,
  replyCountLabel,
  toggleReaction,
  patchPost,
  patchThread,
  type PostMenuAction,
  asDeleted,
} from "@/features/forum/forum";
import {
  deletePost,
  deleteThread,
  fetchThread,
  reply,
  setReaction,
} from "@/features/forum/forum-api";
import { timeAgo } from "@/features/session-activity/comments";
import { authClient } from "@/lib/auth-client";

const NETWORK = "Check your connection and try again.";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });

type State =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly thread: ForumThread;
      readonly replies: ReadonlyArray<ForumPost>;
      readonly cursor: string | null;
    };

/** One thread: the opening post, its replies oldest first, and a box to reply. */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: auth } = authClient.useSession();
  const meId = auth?.user.id ?? null;
  const [state, setState] = useState<State>({ status: "loading" });
  const [generation, setGeneration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    fetchThread(id)
      .then((page) => {
        if (!live) return;
        setState(
          page
            ? {
                status: "ready",
                thread: page.thread,
                replies: page.replies,
                cursor: page.nextCursor,
              }
            : { status: "missing" },
        );
      })
      .catch(() => live && setState({ status: "error" }));

    return () => {
      live = false;
    };
  }, [id, generation]);

  const retry = () => {
    setState({ status: "loading" });
    setGeneration((g) => g + 1);
  };

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.cursor || loadingMore) return;
    setLoadingMore(true);
    fetchThread(id, state.cursor)
      .then((page) => {
        if (!page) return;
        setState((s) =>
          s.status === "ready"
            ? { ...s, replies: mergeById(s.replies, page.replies), cursor: page.nextCursor }
            : s,
        );
      })
      .catch(() => setProblem(`Couldn't load more replies. ${NETWORK}`))
      .finally(() => setLoadingMore(false));
  }, [id, state, loadingMore]);

  const error = tried ? bodyError(draft, "reply") : null;

  const send = async () => {
    setTried(true);

    if (bodyError(draft, "reply")) return;
    setPosting(true);
    setProblem(null);

    try {
      const outcome = await reply(id, draft.trim());

      if ("refusal" in outcome) {
        setProblem(outcome.refusal);

        return;
      }

      setDraft("");
      setTried(false);
      setState((s) =>
        s.status === "ready"
          ? {
              ...s,
              thread: patchThread(s.thread, { replyCount: s.thread.replyCount + 1 }),
              replies: s.cursor ? s.replies : mergeById(s.replies, [outcome.ok]),
            }
          : s,
      );
    } catch {
      setProblem(`Couldn't post your reply. ${NETWORK}`);
    } finally {
      setPosting(false);
    }
  };

  const react = (target: "thread" | "post", targetId: string, kind: ForumReactionKind) => {
    if (state.status !== "ready") return;

    const before =
      target === "thread"
        ? state.thread.reactions
        : state.replies.find((p) => p.id === targetId)?.reactions;

    if (!before) return;
    const { reactions, on } = toggleReaction(before, kind);

    const put = (next: typeof before) =>
      setState((s) => {
        if (s.status !== "ready") return s;

        if (target === "thread") {
          return { ...s, thread: patchThread(s.thread, { reactions: next }) };
        }

        return {
          ...s,
          replies: s.replies.map((p) =>
            p.id === targetId ? patchPost(p, { reactions: next }) : p,
          ),
        };
      });

    put(reactions);
    setProblem(null);
    setReaction(target, targetId, kind, on)
      .then((outcome) => {
        if ("refusal" in outcome) {
          put(before);
          setProblem(outcome.refusal);
        }
      })
      .catch(() => {
        put(before);
        setProblem(`Couldn't save your reaction. ${NETWORK}`);
      });
  };

  const removeThread = (thread: ForumThread) =>
    confirmDestructive(
      "Delete your thread?",
      "It's removed from the forum for everyone, with its replies.",
      "Delete thread",
      () => {
        setBusy(thread.id);
        setProblem(null);
        deleteThread(thread.id)
          .then((outcome) => {
            if ("refusal" in outcome) setProblem(outcome.refusal);
            else router.back();
          })
          .catch(() => setProblem(`Couldn't delete your thread. ${NETWORK}`))
          .finally(() => setBusy(null));
      },
    );

  const removeReply = (post: ForumPost) =>
    confirmDestructive(
      "Delete your reply?",
      'It shows as "Post deleted" for everyone.',
      "Delete reply",
      () => {
        setBusy(post.id);
        setProblem(null);
        deletePost(post.id)
          .then((outcome) => {
            if ("refusal" in outcome) {
              setProblem(outcome.refusal);

              return;
            }

            setState((s) =>
              s.status === "ready"
                ? {
                    ...s,
                    thread: patchThread(s.thread, {
                      replyCount: Math.max(0, s.thread.replyCount - 1),
                    }),
                    replies: s.replies.map((p) => (p.id === post.id ? asDeleted(p) : p)),
                  }
                : s,
            );
          })
          .catch(() => setProblem(`Couldn't delete your reply. ${NETWORK}`))
          .finally(() => setBusy(null));
      },
    );

  const report = (type: "thread" | "post", postId: string, author: ForumAuthor) =>
    router.push({
      pathname: "/forum/report",
      params: { type, id: postId, authorId: author.id, name: author.displayName },
    });

  const title = state.status === "ready" ? state.thread.category.name : "";

  if (state.status !== "ready") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Stack.Screen options={{ title }} />
        {state.status === "loading" ? <Loading label="Loading the thread" /> : null}
        {state.status === "missing" ? (
          <EmptyState
            title="Thread not found"
            body="It may have been deleted, or it isn't open to you."
            action={{ label: "Back to the forum", onPress: () => router.back() }}
          />
        ) : null}
        {state.status === "error" ? (
          <EmptyState
            title="Couldn't load this thread"
            body={NETWORK}
            action={{ label: "Try again", onPress: retry }}
          />
        ) : null}
      </Screen>
    );
  }

  const { thread } = state;
  const threadMine = thread.author.id === meId;

  const onAction = (
    action: PostMenuAction,
    target: { type: "thread" | "post"; id: string; author: ForumAuthor },
    remove: () => void,
  ) => (action === "delete" ? remove() : report(target.type, target.id, target.author));

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        data={state.replies}
        keyExtractor={(post) => post.id}
        ListHeaderComponent={
          <View style={styles.group}>
            <PostCard
              author={thread.author}
              mine={threadMine}
              when={timeAgo(thread.createdAt, now)}
              title={thread.title}
              body={thread.body}
              reactions={thread.reactions}
              actions={postMenuActions(thread.author.id, meId)}
              busy={busy === thread.id}
              onOpenAuthor={() => openPlayer(thread.author.id)}
              onToggleReaction={(kind) => react("thread", thread.id, kind)}
              onAction={(action) =>
                onAction(action, { type: "thread", id: thread.id, author: thread.author }, () =>
                  removeThread(thread),
                )
              }
            />
            <Text variant="heading" accessibilityRole="header" tabular>
              {replyCountLabel(thread.replyCount)}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            author={item.author}
            mine={item.author?.id === meId}
            when={timeAgo(item.createdAt, now)}
            body={item.body}
            reactions={item.reactions}
            actions={postMenuActions(item.author?.id ?? null, meId)}
            busy={busy === item.id}
            onOpenAuthor={() => item.author && openPlayer(item.author.id)}
            onToggleReaction={(kind) => react("post", item.id, kind)}
            onAction={(action) =>
              item.author &&
              onAction(action, { type: "post", id: item.id, author: item.author }, () =>
                removeReply(item),
              )
            }
          />
        )}
        ListFooterComponent={
          <View style={styles.group}>
            {state.cursor ? (
              <Button
                label="Show more replies"
                variant="quiet"
                size="small"
                loading={loadingMore}
                onPress={loadMore}
              />
            ) : null}
            <ErrorBanner>{problem}</ErrorBanner>
            <View style={styles.group}>
              <TextField
                label="Your reply"
                value={draft}
                onChangeText={setDraft}
                error={error ?? undefined}
                hint={lengthHint(draft, FORUM_BODY_MAX)}
                multiline
                maxLength={FORUM_BODY_MAX + 100}
              />
              <Button label="Post reply" loading={posting} onPress={() => void send()} />
            </View>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[3], paddingBottom: space[8] },
  group: { gap: space[3] },
});
