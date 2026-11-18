import type { Club, ClubReview } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Platform, StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space, Tag, Text } from "@/design";
import {
  averageLabel,
  clubTags,
  filledStars,
  mergeById,
  reviewCountLabel,
} from "@/features/clubs/clubs";
import { fetchClub, fetchReviews, onReviewChanged } from "@/features/clubs/clubs-api";
import { RatingBreakdown, ReviewCard, Stars } from "@/features/clubs/components";
import { mapsUrl } from "@/features/sessions/format";
import { useNow } from "@/features/sessions/use-sessions";
import { distanceLabel } from "@/lib/distance";

const NETWORK = "Check your connection and try again.";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });

type State =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly club: Club;
      readonly reviews: ReadonlyArray<ClubReview>;
      readonly cursor: string | null;
    };

/** One club: where it is, its stars, my review, and everyone else's newest first. */
export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [generation, setGeneration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    let live = true;
    Promise.all([fetchClub(id), fetchReviews(id)])
      .then(([club, page]) => {
        if (!live) return;
        setState(
          club && page
            ? { status: "ready", club, reviews: page.items, cursor: page.nextCursor }
            : { status: "missing" },
        );
      })
      .catch(() => live && setState((s) => (s.status === "ready" ? s : { status: "error" })));
    return () => {
      live = false;
    };
  }, [id, generation]);

  useEffect(() => onReviewChanged((clubId) => clubId === id && setGeneration((g) => g + 1)), [id]);

  const retry = () => {
    setState({ status: "loading" });
    setGeneration((g) => g + 1);
  };

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.cursor || loadingMore) return;
    setLoadingMore(true);
    setProblem(null);
    fetchReviews(id, state.cursor)
      .then((page) => {
        if (!page) return;
        setState((s) =>
          s.status === "ready"
            ? { ...s, reviews: mergeById(s.reviews, page.items), cursor: page.nextCursor }
            : s,
        );
      })
      .catch(() => setProblem(`Couldn't load more reviews. ${NETWORK}`))
      .finally(() => setLoadingMore(false));
  }, [id, state, loadingMore]);

  if (state.status !== "ready") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Stack.Screen options={{ title: "" }} />
        {state.status === "loading" ? <Loading label="Loading the club" /> : null}
        {state.status === "missing" ? (
          <EmptyState
            title="Club not found"
            body="It may have been removed from the list."
            action={{ label: "Back to clubs", onPress: () => router.back() }}
          />
        ) : null}
        {state.status === "error" ? (
          <EmptyState
            title="Couldn't load this club"
            body={NETWORK}
            action={{ label: "Try again", onPress: retry }}
          />
        ) : null}
      </Screen>
    );
  }

  const { club } = state;
  const mine = club.myReview;
  const others = state.reviews.filter((review) => !review.mine);
  const distance = distanceLabel(club.distanceKm);
  const openReview = () =>
    router.push({ pathname: "/clubs/review", params: { id: club.id, name: club.name } });

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        data={others}
        keyExtractor={(review) => review.id}
        renderItem={({ item }) => (
          <ReviewCard
            review={item}
            now={now}
            onOpenAuthor={() => openPlayer(item.author.id)}
            onReport={() =>
              router.push({
                pathname: "/clubs/report",
                params: {
                  id: item.id,
                  clubId: item.clubId,
                  authorId: item.author.id,
                  name: item.author.displayName,
                },
              })
            }
          />
        )}
        ListHeaderComponent={
          <View style={styles.sections}>
            <View style={styles.group}>
              <Text variant="title">{club.name}</Text>
              {club.address || distance ? (
                <Text color="textMuted">
                  {[club.address, distance].filter(Boolean).join(" · ")}
                </Text>
              ) : null}
              <View style={styles.tags}>
                {clubTags(club).map((tag) => (
                  <Tag key={tag} label={tag} />
                ))}
              </View>
              <Button
                variant="quiet"
                size="small"
                label="Open in Maps"
                onPress={() => void Linking.openURL(mapsUrl(club.point, club.name, Platform.OS))}
              />
            </View>

            <View style={styles.group}>
              <Text variant="heading" accessibilityRole="header">
                Ratings
              </Text>
              {club.rating.average === null ? (
                <Text color="textMuted">No reviews yet. Yours would be the first.</Text>
              ) : (
                <>
                  <View
                    style={styles.average}
                    accessible
                    accessibilityLabel={`Rated ${averageLabel(club.rating.average)} out of 5 from ${reviewCountLabel(club.rating.count)}`}
                  >
                    <Text variant="display" tabular>
                      {averageLabel(club.rating.average)}
                    </Text>
                    <View style={styles.group}>
                      <Stars filled={filledStars(club.rating.average)} />
                      <Text variant="caption" color="textMuted" tabular>
                        {reviewCountLabel(club.rating.count)}
                      </Text>
                    </View>
                  </View>
                  <RatingBreakdown counts={club.ratingCounts} />
                </>
              )}
            </View>

            {mine ? (
              <ReviewCard
                review={mine}
                now={now}
                onOpenAuthor={() => undefined}
                onEdit={openReview}
              />
            ) : (
              <Button label="Write a review" onPress={openReview} />
            )}

            {others.length > 0 ? (
              <Text variant="heading" accessibilityRole="header">
                {mine ? "Other reviews" : "Reviews"}
              </Text>
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.group}>
            {state.cursor ? (
              <Button
                label="Show more reviews"
                variant="quiet"
                size="small"
                loading={loadingMore}
                onPress={loadMore}
              />
            ) : null}
            <ErrorBanner>{problem}</ErrorBanner>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[3], paddingBottom: space[8] },
  sections: { gap: space[6], paddingBottom: space[1] },
  group: { gap: space[2] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  average: { flexDirection: "row", alignItems: "center", gap: space[4] },
});
