import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { motion, radius, size, space } from "../tokens";
import { useColors } from "../use-tokens";

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card one tap target. Give it an accessibilityLabel. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** `sunken` for a quiet group inside a card or on a surface. */
  tone?: "surface" | "sunken";
  style?: StyleProp<ViewStyle>;
};

/**
 * The one card: a surface with a hairline border and soft corners, flat on
 * the ground. Cards never nest; inside a card, group with space or a
 * `sunken` block.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  tone = "surface",
  style,
}: CardProps) {
  const palette = useColors();
  const fill = tone === "surface" ? palette.surface : palette.surfaceSunken;
  const base = [
    styles.card,
    { backgroundColor: fill, borderColor: tone === "surface" ? palette.border : fill },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && {
          backgroundColor: palette.surfacePressed,
          transform: [{ scale: motion.pressScale }],
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: size.hairline,
    padding: space[4],
    gap: space[2],
  },
});
