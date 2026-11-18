import { Match } from "effect";
import type { Conversation } from "@love-all/domain";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { EmptyState, Loading, Screen, size, space, useColors } from "@/design";
import { ConversationRow } from "@/features/messages/components";
import { useInbox } from "@/features/messages/use-inbox";

const openConversation = (conversation: Conversation) =>
  router.push({
    pathname: "/messages/[id]",
    params: { id: conversation.id, name: conversation.otherPlayer.displayName },
  });

/** My conversations, latest message first. A conversation starts from a profile or a session. */
export default function MessagesScreen() {
  const palette = useColors();
  const { status, items, loadingMore, loadMore, refresh } = useInbox();
  const [now] = useState(() => new Date());

  return (
    <Screen title="Messages" scroll={false} edges={["top", "left", "right"]}>
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(conversation) => conversation.id}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} now={now} onPress={() => openConversation(item)} />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? <Loading label="Loading more conversations" /> : undefined
        }
        ListEmptyComponent={Match.value(status).pipe(
          Match.when("loading", () => <Loading label="Loading your messages" />),
          Match.when("error", () => (
            <EmptyState
              title="Couldn't load your messages"
              body="Check your connection and try again."
              action={{ label: "Try again", onPress: refresh }}
            />
          )),
          Match.orElse(() => (
            <View style={styles.empty}>
              <EmptyState
                title="No messages yet"
                body="Message a player from their profile or a session to sort out a time and a court."
                action={{ label: "Find players", onPress: () => router.navigate("/players") }}
              />
            </View>
          )),
        )}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refresh}
            tintColor={palette.textMuted}
            colors={[palette.accent]}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[2], paddingBottom: size.tabBarClearance },
  empty: { paddingTop: space[8] },
});
