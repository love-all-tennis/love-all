import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  Button,
  ErrorBanner,
  Icon,
  motion,
  radius,
  Screen,
  size,
  space,
  Text,
  useColors,
} from "@/design";

export const SETUP_STEPS = 4;

/** One step of setup: where you are, a title, a line on why we ask, the fields, and a button. */
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
  return (
    // The stack's native header sits above, so only pad the other edges.
    <Screen edges={["left", "right", "bottom"]}>
      <View style={styles.header}>
        <Text variant="label" color="textMuted">
          Step {step} of {SETUP_STEPS}
        </Text>
        <Text variant="title">{title}</Text>
        <Text color="textMuted">{subtitle}</Text>
      </View>
      <View style={styles.fields}>{children}</View>
      <View style={styles.footer}>
        <ErrorBanner>{error}</ErrorBanner>
        <Button label={actionLabel} onPress={onAction} loading={busy} />
      </View>
    </Screen>
  );
}

/** A labelled group of fields inside a step, such as "Open to". */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

/** Chips that wrap onto as many lines as they need. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.wrap}>{children}</View>;
}

/** One cell of the availability grid: a time block on a day. */
export function SlotToggle({
  label,
  selected,
  onPress,
}: {
  /** What a screen reader says: "Tue evening". */
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.slot,
        selected
          ? { backgroundColor: palette.accentSoft, borderColor: palette.accent }
          : { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        pressed && { opacity: motion.pressOpacity },
      ]}
    >
      {selected ? <Icon ios="checkmark" md="check" color="onAccentSoft" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: space[2] },
  fields: { gap: space[6] },
  footer: { gap: space[3] },
  group: { gap: space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  slot: {
    flex: 1,
    minHeight: size.minTap,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: size.hairline,
  },
});
