import { MESSAGE_BODY_MAX, type Conversation, type DirectMessage } from "@love-all/domain";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, FlatList, Platform, Pressable, StyleSheet, View } from "react-native";

import {
  Button,
  EmptyState,
  ErrorBanner,
  Icon,
  Loading,
  motion,
  Screen,
  size,
  space,
  Text,
  TextField,
} from "@/design";
import { DayHeading, MessageBubble } from "@/features/messages/components";
import { mergeMessages, messageError, threadItems } from "@/features/messages/messages";
import { fetchMessages, GONE, markRead, sendMessage } from "@/features/messages/messages-api";
import { takeOneUnread } from "@/features/messages/unread-store";

const NETWORK = "Check your connection and try again.";

type State =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly conversation: Conversation;
      readonly messages: ReadonlyArray<DirectMessage>;
      readonly cursor: string | null;
    };

/**
 * One conversation: messages newest at the bottom, and a box to send. It
 * isn't live: it refreshes when opened, when the app comes back, and after
 * I send.
 */
export default function ConversationScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const generation = useRef(0);

  /** Loads the newest page and merges it in, then marks the conversation read. */
  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchMessages(id)
      .then((page) => {
        if (mine !== generation.current) return;
        if (!page) {
          setState({ status: "missing" });
          return;
        }
        setState((s) =>
          s.status === "ready"
            ? {
                ...s,
                conversation: page.conversation,
                messages: mergeMessages(s.messages, page.items),
              }
            : {
                status: "ready",
                conversation: page.conversation,
                messages: page.items,
                cursor: page.nextCursor,
              },
        );
        if (page.conversation.unreadCount > 0) {
          void markRead(id)
            .then(takeOneUnread)
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (mine !== generation.current) return;
        setState((s) => (s.status === "ready" ? s : { status: "error" }));
      });
  }, [id]);

  useFocusEffect(refresh);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const retry = () => {
    setState({ status: "loading" });
    refresh();
  };

  const loadOlder = () => {
    if (state.status !== "ready" || !state.cursor || loadingMore) return;
    setLoadingMore(true);
    fetchMessages(id, state.cursor)
      .then((page) => {
        if (!page) return;
        setState((s) =>
          s.status === "ready"
            ? { ...s, messages: mergeMessages(s.messages, page.items), cursor: page.nextCursor }
            : s,
        );
      })
      .catch(() => setProblem(`Couldn't load older messages. ${NETWORK}`))
      .finally(() => setLoadingMore(false));
  };

  const error = tried ? messageError(draft) : null;

  const send = async () => {
    setTried(true);
    if (messageError(draft)) return;
    setSending(true);
    setProblem(null);
    try {
      const outcome = await sendMessage(id, draft.trim());
      if ("refusal" in outcome) {
        setProblem(outcome.refusal);
        return;
      }
      setDraft("");
      setTried(false);
      setState((s) =>
        s.status === "ready" ? { ...s, messages: mergeMessages(s.messages, [outcome.ok]) } : s,
      );
      // Picks up anything they sent meanwhile.
      refresh();
    } catch {
      setProblem(`Couldn't send your message. ${NETWORK}`);
    } finally {
      setSending(false);
    }
  };

  const title =
    state.status === "ready" ? state.conversation.otherPlayer.displayName : (name ?? "");
  const other = state.status === "ready" ? state.conversation.otherPlayer : null;
  const openProfile = () =>
    other && router.push({ pathname: "/players/[id]", params: { id: other.id } });

  /** Their messages can be reported: it goes to the moderators with the message attached. */
  const offerReport = (message: DirectMessage) => {
    if (!other) return;
    const report = () =>
      router.push({
        pathname: "/players/report",
        params: { id: other.id, name: other.displayName, messageId: message.id },
      });
    if (Platform.OS === "web") {
      report();
      return;
    }
    Alert.alert("Report this message?", "It goes to the Love All moderators.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report message", style: "destructive", onPress: report },
    ]);
  };

  const header = (
    <Stack.Screen
      options={{
        title,
        headerRight: other
          ? () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${other.displayName}'s profile`}
                hitSlop={space[2]}
                onPress={openProfile}
                style={({ pressed }) => [
                  styles.headerButton,
                  pressed && { opacity: motion.pressOpacity },
                ]}
              >
                <Icon ios="person.crop.circle" md="account_circle" color="accent" />
              </Pressable>
            )
          : undefined,
      }}
    />
  );

  if (state.status !== "ready") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        {header}
        {state.status === "loading" ? <Loading label="Loading the conversation" /> : null}
        {state.status === "missing" ? (
          <EmptyState
            title="Conversation not available"
            body={GONE}
            action={{ label: "Back to messages", onPress: () => router.back() }}
          />
        ) : null}
        {state.status === "error" ? (
          <EmptyState
            title="Couldn't load this conversation"
            body={NETWORK}
            action={{ label: "Try again", onPress: retry }}
          />
        ) : null}
      </Screen>
    );
  }

  const items = threadItems(state.messages, now);

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      {header}
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        inverted
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          item.kind === "day" ? (
            <DayHeading label={item.label} />
          ) : (
            <MessageBubble
              message={item.message}
              senderName={state.conversation.otherPlayer.displayName}
              {...(item.message.mine ? {} : { onLongPress: () => offerReport(item.message) })}
            />
          )
        }
        ListFooterComponent={
          state.cursor ? (
            <Button
              label="Show older messages"
              variant="quiet"
              size="small"
              loading={loadingMore}
              onPress={loadOlder}
            />
          ) : (
            <Text variant="caption" color="textMuted" style={styles.intro}>
              {`Messages between you and ${state.conversation.otherPlayer.displayName}. Long press one of theirs to report it.`}
            </Text>
          )
        }
      />
      <View style={styles.composer}>
        <ErrorBanner>{problem}</ErrorBanner>
        <TextField
          label="Message"
          value={draft}
          onChangeText={setDraft}
          error={error ?? undefined}
          multiline
          maxLength={MESSAGE_BODY_MAX + 100}
        />
        <Button label="Send message" loading={sending} onPress={() => void send()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[2], paddingVertical: space[2] },
  intro: { textAlign: "center", paddingVertical: space[4] },
  composer: { gap: space[2], paddingTop: space[2] },
  headerButton: {
    minWidth: size.minTap,
    minHeight: size.minTap,
    alignItems: "center",
    justifyContent: "center",
  },
});
