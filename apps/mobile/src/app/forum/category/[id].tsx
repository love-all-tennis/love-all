import { router, Stack, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, StyleSheet } from "react-native";

import { Button, EmptyState, Loading, Screen, space, useColors } from "@/design";
import { ThreadCard } from "@/features/forum/components";
import { useThreadList } from "@/features/forum/use-forum";
import { useNow } from "@/features/sessions/use-sessions";

const openThread = (id: string) => router.push({ pathname: "/forum/thread/[id]", params: { id } });

/** A category's threads, latest activity first, loading more as I scroll. */
export default function CategoryScreen() {
  const palette = useColors();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const list = useThreadList(id);
  const now = useNow();
  const startThread = () => router.push({ pathname: "/forum/new", params: { categoryId: id } });

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: name ?? "" }} />
      {list.status === "missing" ? (
        <EmptyState
          title="Category not found"
          body="It isn't open to you. Local categories are for players in that metro."
          action={{ label: "Back to the forum", onPress: () => router.back() }}
        />
      ) : (
        <FlatList
          style={styles.fill}
          contentContainerStyle={styles.list}
          data={list.threads}
          keyExtractor={(thread) => thread.id}
          renderItem={({ item }) => (
            <ThreadCard thread={item} now={now} onPress={() => openThread(item.id)} />
          )}
          ListHeaderComponent={
            list.threads.length > 0 ? (
              <Button label="New thread" variant="primary" onPress={startThread} />
            ) : undefined
          }
          ListEmptyComponent={
            list.status === "loading" ? (
              <Loading label="Loading threads" />
            ) : list.status === "error" ? (
              <EmptyState
                title="Couldn't load threads"
                body="Check your connection and try again."
                action={{ label: "Try again", onPress: list.refresh }}
              />
            ) : (
              <EmptyState
                title="No threads yet"
                body="Ask a question or share something with other players."
                action={{ label: "New thread", onPress: startThread }}
              />
            )
          }
          ListFooterComponent={
            list.loadingMore ? <Loading label="Loading more threads" /> : undefined
          }
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={list.refresh}
              tintColor={palette.textMuted}
              colors={[palette.accent]}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[2], paddingBottom: space[8] },
});
