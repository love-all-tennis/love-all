import type { EquipmentReview } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Button, Card, EmptyState, Loading, Screen, space, Tag, Text, useColors } from "@/design";
import { RatingBreakdown, ReviewCard } from "@/features/gear/components";
import { itemName, KIND_LABELS } from "@/features/gear/gear";
import { useItem } from "@/features/gear/use-gear";
import { useNow } from "@/features/sessions/use-sessions";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });

/** Reports the review itself, so moderators see what was written. */
const reportReview = (review: EquipmentReview) =>
  router.push({
    pathname: "/gear/report",
    params: { id: review.id, authorId: review.author.id, name: review.author.displayName },
  });

/** An item: its ratings, my review (or the button to write one), then everyone else's. */
export default function GearItemScreen() {
  const palette = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, loadingMore, loadMore, refresh } = useItem(id);
  const now = useNow();
  const writeReview = () => router.push({ pathname: "/gear/review", params: { id } });

  if (state.status === "loading") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading gear" />
      </Screen>
    );
  }
  if (state.status === "missing" || state.status === "error") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        {state.status === "missing" ? (
          <EmptyState
            title="Item not found"
            body="It's no longer in the catalog."
            action={{ label: "Back to gear", onPress: () => router.back() }}
          />
        ) : (
          <EmptyState
            title="Couldn't load this item"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: refresh }}
          />
        )}
      </Screen>
    );
  }

  const { item, reviews } = state;
  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        data={reviews}
        keyExtractor={(review) => review.id}
        renderItem={({ item: review }) => (
          <ReviewCard
            review={review}
            now={now}
            onOpenAuthor={() => openPlayer(review.author.id)}
            onReport={() => reportReview(review)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.title}>
              <Tag label={KIND_LABELS[item.kind]} />
              <Text variant="title" accessibilityRole="header">
                {itemName(item)}
              </Text>
            </View>
            <Card>
              <RatingBreakdown rating={item.rating} />
            </Card>
            {item.myReview ? (
              <View style={styles.group}>
                <View style={styles.headingRow}>
                  <Text variant="heading" accessibilityRole="header" style={styles.fill}>
                    Your review
                  </Text>
                  <Button variant="quiet" size="small" label="Edit review" onPress={writeReview} />
                </View>
                <ReviewCard review={item.myReview} now={now} mine />
              </View>
            ) : (
              <Button label="Write a review" onPress={writeReview} />
            )}
            {reviews.length > 0 && (
              <Text variant="heading" accessibilityRole="header">
                Reviews from other players
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          item.myReview && item.rating.count <= 1 ? (
            <Text color="textMuted">No one else has reviewed it yet.</Text>
          ) : undefined
        }
        ListFooterComponent={loadingMore ? <Loading label="Loading more reviews" /> : undefined}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
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
  list: { gap: space[3], paddingBottom: space[8] },
  header: { gap: space[4], paddingBottom: space[1] },
  title: { gap: space[2], alignItems: "flex-start" },
  group: { gap: space[2] },
  headingRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
