import { ActivityIndicator, StyleSheet, View } from "react-native";

import { radius, space } from "../tokens";
import { useColors } from "../use-tokens";
import { Button } from "./button";
import { Text } from "./text";

/** First-load spinner, centred in `textMuted`. On refresh, keep the old content up instead. */
export function Loading({ label = "Loading" }: { label?: string }) {
  const palette = useColors();

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={palette.textMuted} accessibilityLabel={label} />
    </View>
  );
}

/**
 * An empty or error state: what's missing or what failed, the next step, and
 * at most one button.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.empty}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      <Text color="textMuted">{body}</Text>
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

/** An error banner in place, such as a failed save. Read out as soon as it shows. */
export function ErrorBanner({ children }: { children: string | null | undefined }) {
  const palette = useColors();

  if (!children) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: palette.dangerSoft }]}
    >
      <Text variant="caption" color="onDangerSoft">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: space[10], alignItems: "center" },
  empty: { gap: space[2], paddingVertical: space[6] },
  action: { paddingTop: space[2] },
  banner: {
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
