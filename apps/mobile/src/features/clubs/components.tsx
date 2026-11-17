import type { ClubRatingSummary, ClubReview, ClubSummary } from "@love-all/domain";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar, Button, Card, motion, radius, size, space, Tag, Text, useColors } from "@/design";
import { timeAgo } from "@/features/session-activity/comments";
import { distanceLabel } from "@/lib/distance";
import {
  averageLabel,
  clubTags,
  filledStars,
  ratingAccessibilityLabel,
  ratingBars,
  reviewCountLabel,
  starChoiceLabel,
  STAR_WORDS,
  wasEdited,
} from "./clubs";

/**
 * One star: filled in the accent, or an outline. Drawn as a text glyph so
 * filled and empty differ by shape on every platform, not only by colour.
 */
function Star({ on, size: starSize }: { on: boolean; size: keyof typeof size.icon }) {
  const px = size.icon[starSize];
  return (
    <Text
      color={on ? "accent" : "borderStrong"}
      style={{ fontSize: px, lineHeight: px + space[1] }}
      allowFontScaling
    >
      {on ? "\u2605" : "\u2606"}
    </Text>
  );
}

/** Five stars, `filled` of them in the accent. Decorative: pair it with the number. */
export function Stars({ filled, small }: { filled: number; small?: boolean }) {
  return (
    <View
      style={styles.stars}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} on={n <= filled} size={small ? "sm" : "md"} />
      ))}
    </View>
  );
}

/** "★★★★☆ 4.3 · 12 reviews", or "No reviews yet". */
export function RatingLine({ rating }: { rating: ClubRatingSummary }) {
  if (rating.average === null) {
    return (
      <Text variant="caption" color="textMuted">
        No reviews yet
      </Text>
    );
  }
  return (
    <View
      style={styles.ratingLine}
      accessible
      accessibilityLabel={ratingAccessibilityLabel(rating)}
    >
      <Stars filled={filledStars(rating.average)} small />
      <Text variant="caption" tabular>
        {averageLabel(rating.average)}
      </Text>
      <Text variant="caption" color="textMuted" tabular>
        · {reviewCountLabel(rating.count)}
      </Text>
    </View>
  );
}

/** A club in the list: name, where it is, its stars and up to two tags. */
export function ClubCard({ club, onPress }: { club: ClubSummary; onPress: () => void }) {
  const distance = distanceLabel(club.distanceKm);
  const meta = [club.address, distance].filter(Boolean).join(" · ");
  const tags = clubTags(club);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[club.name, meta, ratingAccessibilityLabel(club.rating), ...tags]
        .filter(Boolean)
        .join(". ")}
    >
      <View style={styles.cardText}>
        <Text variant="subheading" numberOfLines={2}>
          {club.name}
        </Text>
        {meta ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <RatingLine rating={club.rating} />
      </View>
      <View style={styles.tags}>
        {tags.map((tag) => (
          <Tag key={tag} label={tag} />
        ))}
      </View>
    </Card>
  );
}

/** The 5-to-1 star breakdown on a club's page. */
export function RatingBreakdown({ counts }: { counts: ReadonlyArray<number> }) {
  const palette = useColors();
  return (
    <View style={styles.bars}>
      {ratingBars(counts).map((bar) => (
        <View
          key={bar.stars}
          style={styles.bar}
          accessible
          accessibilityLabel={`${bar.stars} ${bar.stars === 1 ? "star" : "stars"}: ${reviewCountLabel(bar.count)}`}
        >
          <Text variant="caption" color="textMuted" tabular style={styles.barLabel}>
            {bar.stars}
          </Text>
          <View style={[styles.track, { backgroundColor: palette.surfaceSunken }]}>
            {bar.share > 0 ? (
              <View
                style={[
                  styles.fillBar,
                  { backgroundColor: palette.accent, width: `${Math.round(bar.share * 100)}%` },
                ]}
              />
            ) : null}
          </View>
          <Text variant="caption" color="textMuted" tabular style={styles.barCount}>
            {bar.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Pick 1 to 5 stars. Each star is its own 44pt button, and the choice is named below. */
export function StarPicker({
  value,
  onChange,
  error,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  error?: string | null;
}) {
  return (
    <View style={styles.picker}>
      <Text variant="label" color="textMuted">
        Your rating
      </Text>
      <View style={styles.pickerRow} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value !== null && n <= value;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={starChoiceLabel(n)}
              accessibilityState={{ checked: value === n }}
              onPress={() => onChange(n)}
              style={({ pressed }) => [styles.pickerStar, pressed && styles.pressed]}
            >
              <Star on={on} size="lg" />
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : (
        <Text variant="caption" color="textMuted">
          {value === null ? "Tap a star." : STAR_WORDS[value - 1]}
        </Text>
      )}
    </View>
  );
}

/** A review: who wrote it, their stars, when, and the note. My own gets an Edit button. */
export function ReviewCard({
  review,
  now,
  onOpenAuthor,
  onEdit,
}: {
  review: ClubReview;
  now: Date;
  onOpenAuthor: () => void;
  onEdit?: () => void;
}) {
  const when = `${timeAgo(review.createdAt, now)}${wasEdited(review) ? " · Edited" : ""}`;
  return (
    <Card>
      <View style={styles.reviewHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${review.author.displayName}'s profile`}
          onPress={onOpenAuthor}
          disabled={review.mine}
          style={({ pressed }) => [styles.author, pressed && styles.pressed]}
        >
          <Avatar name={review.author.displayName} photoUrl={review.author.photoUrl} size="sm" />
          <View style={styles.cardText}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {review.mine ? "Your review" : review.author.displayName}
            </Text>
            <Text variant="caption" color="textMuted">
              {when}
            </Text>
          </View>
        </Pressable>
        {onEdit ? <Button label="Edit" variant="quiet" size="small" onPress={onEdit} /> : null}
      </View>
      <View
        style={styles.ratingLine}
        accessible
        accessibilityLabel={`${review.rating} out of 5 stars`}
      >
        <Stars filled={review.rating} small />
      </View>
      {review.body ? <Text>{review.body}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: "row", gap: space[1] / 2 },
  ratingLine: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  cardText: { flex: 1, gap: space[1] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  bars: { gap: space[2] },
  bar: { flexDirection: "row", alignItems: "center", gap: space[3] },
  barLabel: { minWidth: space[3] },
  barCount: { minWidth: space[6], textAlign: "right" },
  track: { flex: 1, height: space[2], borderRadius: radius.full, overflow: "hidden" },
  fillBar: { height: "100%", borderRadius: radius.full },
  picker: { gap: space[2] },
  pickerRow: { flexDirection: "row", gap: space[1] },
  pickerStar: {
    minWidth: size.minTap,
    minHeight: size.minTap,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: motion.pressOpacity },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: space[3] },
  author: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[3] },
});
