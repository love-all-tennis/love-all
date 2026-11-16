import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** The accent for picked chips and the main button. */
export const Accent = "#208AEF";

/** One step of setup: a title, a line on why we ask, the fields, and a button. */
export function StepScreen({
  step,
  title,
  subtitle,
  children,
  error,
  actionLabel,
  onAction,
  busy = false,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Shown above the button once the player has tried to move on. */
  error: string | null;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inner}>
        <ThemedText type="small" themeColor="textSecondary">
          Step {step} of 4
        </ThemedText>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>
        <View style={styles.fields}>{children}</View>
        {error ? (
          <ThemedText type="small" style={styles.error} accessibilityRole="alert">
            {error}
          </ThemedText>
        ) : null}
        <PrimaryButton label={actionLabel} onPress={onAction} busy={busy} />
      </View>
    </ScrollView>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  /** Greyed out and not pressable, for an action that isn't available yet. */
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        (pressed || busy) && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <ThemedText style={styles.primaryLabel}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondary,
        { backgroundColor: theme.backgroundElement },
        (pressed || busy) && styles.pressed,
      ]}
    >
      {busy ? <ActivityIndicator /> : <ThemedText>{label}</ThemedText>}
    </Pressable>
  );
}

/** A toggle pill, used for levels, hands, ways to play and time blocks. */
export function Chip({
  label,
  hint,
  selected,
  onPress,
  compact = false,
  accessibilityLabel,
}: {
  label: string;
  hint?: string;
  /** What a screen reader says, when the visible label is only a mark. */
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={compact ? undefined : hint}
      onPress={onPress}
      style={({ pressed }) => [
        compact ? styles.chipCompact : styles.chip,
        { backgroundColor: selected ? Accent : theme.backgroundElement },
        pressed && styles.pressed,
      ]}
    >
      <ThemedText type="smallBold" style={selected ? styles.onAccent : undefined}>
        {label}
      </ThemedText>
      {hint && !compact ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={selected ? styles.onAccent : undefined}
        >
          {hint}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <ThemedText type="smallBold">{children}</ThemedText>;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  inner: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  fields: {
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  error: {
    color: "#D93F3F",
  },
  primary: {
    backgroundColor: Accent,
    borderRadius: Spacing.five,
    paddingVertical: Spacing.three,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#fff",
    fontWeight: 600,
  },
  secondary: {
    borderRadius: Spacing.five,
    paddingVertical: Spacing.three - Spacing.one,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  chip: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.half,
  },
  chipCompact: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: "center",
  },
  onAccent: {
    color: "#fff",
  },
});
