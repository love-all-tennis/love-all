import type { EquipmentRatingSummary, EquipmentReview, EquipmentSummary } from "@love-all/domain";
import { Pressable, StyleSheet, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  Icon,
  motion,
  radius,
  size,
  space,
  Tag,
  Text,
  useColors,
} from "@/design";
import { timeAgo } from "@/features/session-activity/comments";
import {
  itemName,
  KIND_LABELS,
  ratingLabel,
  reviewCountLabel,
  reviewerLevel,
  starShares,
  starsLabel,
} from "./gear";

const STARS = [1, 2, 3, 4, 5] as const;

/** Five stars, filled up to `value` rounded to the nearest star. Decorative: pair it with words. */
export function Stars({ value, size: iconSize = "sm" }: { value: number; size?: "sm" | "md" }) {
  const filled = Math.round(value);
  return (
    <View
      style={styles.stars}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {STARS.map((star) => (
        <Icon
          key={star}
          ios={star <= filled ? "star.fill" : "star"}
          md="star"
          size={iconSize}
          color={star <= filled ? "accent" : "borderStrong"}
        />
      ))}
    </View>
  );
}

/** An item in the catalog: name, kind, rating, and my stars when I reviewed it. */
export function ItemCard({ item, onPress }: { item: EquipmentSummary; onPress: () => void }) {
  const name = itemName(item);
  const rating = ratingLabel(item.rating);
  const mine = item.myRating === null ? "" : ` You gave it ${starsLabel(item.myRating)}.`;
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${name}, ${KIND_LABELS[item.kind]}. ${rating}.${mine}`}
    >
      <View style={styles.item}>
        <View style={styles.itemTop}>
          <Text variant="subheading" numberOfLines={2} style={styles.flex}>
            {name}
          </Text>
          <Tag label={KIND_LABELS[item.kind]} />
        </View>
        <View style={styles.ratingRow}>
          {item.rating.average !== null && <Stars value={item.rating.average} />}
          <Text variant="caption" color="textMuted" tabular numberOfLines={1} style={styles.flex}>
            {rating}
          </Text>
        </View>
        {item.myRating !== null && (
          <Text variant="caption" color="textMuted">
            You gave it {starsLabel(item.myRating)}
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Pick 1 to 5 stars. Each star is its own 44pt target. */
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
      <Text variant="label" nativeID="rating-label">
        Your rating
      </Text>
      <View
        style={styles.pickerRow}
        accessibilityRole="radiogroup"
        accessibilityLabelledBy="rating-label"
      >
        {STARS.map((star) => (
          <Pressable
            key={star}
            accessibilityRole="radio"
            accessibilityLabel={starsLabel(star)}
            accessibilityState={{ checked: value === star }}
            onPress={() => onChange(star)}
            style={({ pressed }) => [styles.star, pressed && { opacity: motion.pressOpacity }]}
          >
            <Icon
              ios={value !== null && star <= value ? "star.fill" : "star"}
              md="star"
              size="lg"
              color={value !== null && star <= value ? "accent" : "borderStrong"}
            />
          </Pressable>
        ))}
        <Text color="textMuted" tabular>
          {value === null ? "Not rated" : `${value} out of 5`}
        </Text>
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** The average, the count, and a bar per star level. */
export function RatingBreakdown({ rating }: { rating: EquipmentRatingSummary }) {
  const palette = useColors();
  if (rating.average === null) {
    return <Text color="textMuted">No reviews yet. Be the first to rate it.</Text>;
  }
  return (
    <View style={styles.breakdown}>
      <View style={styles.ratingRow} accessible accessibilityLabel={ratingLabel(rating)}>
        <Text variant="title" tabular>
          {rating.average.toFixed(1)}
        </Text>
        <View style={styles.flex}>
          <Stars value={rating.average} size="md" />
          <Text variant="caption" color="textMuted" tabular>
            {reviewCountLabel(rating.count)}
          </Text>
        </View>
      </View>
      {starShares(rating).map((row) => (
        <View
          key={row.stars}
          style={styles.barRow}
          accessible
          accessibilityLabel={`${starsLabel(row.stars)}: ${row.count}`}
        >
          <Text variant="caption" color="textMuted" tabular style={styles.barLabel}>
            {row.stars}
          </Text>
          <View style={[styles.track, { backgroundColor: palette.surfaceSunken }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: palette.accent, width: `${Math.round(row.share * 100)}%` },
              ]}
            />
          </View>
          <Text variant="caption" color="textMuted" tabular style={styles.barCount}>
            {row.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A review: who, their level, when, stars, title and text. */
export function ReviewCard({
  review,
  now,
  mine = false,
  onOpenAuthor,
  onReport,
}: {
  review: EquipmentReview;
  now: Date;
  mine?: boolean;
  onOpenAuthor?: () => void;
  /** Offered on other players' reviews. */
  onReport?: () => void;
}) {
  const level = reviewerLevel(review.authorNtrp);
  const name = mine ? "You" : review.author.displayName;
  const meta = [level, timeAgo(review.updatedAt, now)].filter(Boolean).join(" · ");
  const author = (
    <View style={styles.authorRow}>
      <Avatar name={review.author.displayName} photoUrl={review.author.photoUrl} size="sm" />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
          {meta}
        </Text>
      </View>
    </View>
  );
  return (
    <Card>
      <View style={styles.review}>
        {onOpenAuthor ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${review.author.displayName}, ${meta}. Open their profile`}
            onPress={onOpenAuthor}
            style={({ pressed }) => [
              styles.authorLink,
              pressed && { opacity: motion.pressOpacity },
            ]}
          >
            {author}
          </Pressable>
        ) : (
          author
        )}
        <View style={styles.ratingRow} accessible accessibilityLabel={`${review.rating} out of 5`}>
          <Stars value={review.rating} />
          <Text variant="caption" color="textMuted" tabular>
            {review.rating} out of 5
          </Text>
        </View>
        {review.title && <Text variant="subheading">{review.title}</Text>}
        {review.body && <Text>{review.body}</Text>}
        {onReport && (
          <View style={styles.reviewActions}>
            <Button variant="quiet" size="small" label="Report review" onPress={onReport} />
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stars: { flexDirection: "row", gap: space[1] },
  item: { gap: space[2] },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  picker: { gap: space[2] },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: space[1] },
  star: {
    minWidth: size.minTap,
    minHeight: size.minTap,
    alignItems: "center",
    justifyContent: "center",
  },
  breakdown: { gap: space[2] },
  barRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  barLabel: { minWidth: space[4] },
  barCount: { minWidth: space[6], textAlign: "right" },
  track: { flex: 1, height: space[2], borderRadius: radius.full, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
  review: { gap: space[3] },
  reviewActions: { flexDirection: "row" },
  authorRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  authorLink: { minHeight: size.minTap, justifyContent: "center" },
});
