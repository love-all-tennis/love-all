import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { motion, radius, size, space, type ColorRole } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

type Look = { fill: ColorRole | null; pressed: ColorRole | null; label: ColorRole };

const looks: Record<ButtonVariant, Look> = {
  /** The one main action on a screen. */
  primary: { fill: "accent", pressed: "accentPressed", label: "onAccent" },
  /** Any other action next to it. */
  secondary: { fill: "surfaceSunken", pressed: "surfacePressed", label: "text" },
  /** A low-key text action: "Skip for now", "Edit". */
  quiet: { fill: null, pressed: null, label: "accent" },
  /** Block, report, delete. Asks for a confirm step first. */
  danger: { fill: "danger", pressed: "dangerPressed", label: "onDanger" },
};

export type ButtonProps = {
  /** A verb and its object: "Send invite", "Save profile". */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** `small` is for buttons inside a row or card. */
  size?: "regular" | "small";
  disabled?: boolean;
  /** Shows a spinner and blocks presses while a request runs. */
  loading?: boolean;
  /** An icon before the label. */
  icon?: ReactNode;
  /** What happens, when the label doesn't say it ("Opens their profile"). */
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size: buttonSize = "regular",
  disabled = false,
  loading = false,
  icon,
  accessibilityHint,
}: ButtonProps) {
  const palette = useColors();
  const look = looks[variant];
  const inactive = disabled || loading;
  const small = buttonSize === "small";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={small ? (size.minTap - size.controlSmall) / 2 : undefined}
      style={({ pressed }) => [
        styles.base,
        small ? styles.small : styles.regular,
        look.fill && {
          backgroundColor: palette[pressed && look.pressed ? look.pressed : look.fill],
        },
        pressed && (look.fill ? styles.pressedFill : styles.pressedQuiet),
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette[look.label]} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text variant={small ? "label" : "bodyStrong"} color={look.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
  },
  regular: { minHeight: size.control, paddingHorizontal: space[5] },
  small: { minHeight: size.controlSmall, paddingHorizontal: space[3], alignSelf: "flex-start" },
  content: { flexDirection: "row", alignItems: "center", gap: space[2] },
  pressedFill: { transform: [{ scale: motion.pressScale }] },
  pressedQuiet: { opacity: motion.pressOpacity },
  inactive: { opacity: motion.disabledOpacity },
});
