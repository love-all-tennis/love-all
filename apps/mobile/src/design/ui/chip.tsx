import { Pressable, StyleSheet, View } from "react-native";

import { motion, radius, size, space, type ColorRole } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

export type TagTone = "neutral" | "accent" | "highlight" | "clay" | "danger";

const tagColors: Record<TagTone, readonly [fill: ColorRole, label: ColorRole]> = {
  neutral: ["surfaceSunken", "textMuted"],
  accent: ["accentSoft", "onAccentSoft"],
  highlight: ["highlight", "onHighlight"],
  clay: ["clay", "onClay"],
  danger: ["dangerSoft", "onDangerSoft"],
};

/** A small read-only label: "NTRP 3.5", "Singles", "Open spot", "Clay". */
export function Tag({ label, tone = "neutral" }: { label: string; tone?: TagTone }) {
  const palette = useColors();
  const [fill, text] = tagColors[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette[fill] }]}>
      <Text variant="label" color={text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A toggle in a filter or a pick-several list: levels, formats, days. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      hitSlop={(size.minTap - size.controlSmall) / 2}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: palette.accentSoft, borderColor: palette.accent }
          : { backgroundColor: palette.surface, borderColor: palette.borderStrong },
        pressed && { opacity: motion.pressOpacity },
      ]}
    >
      <Text variant="label" color={selected ? "onAccentSoft" : "text"} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: space[2],
    paddingVertical: space[1] / 2,
  },
  chip: {
    minHeight: size.controlSmall,
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: size.hairline,
    paddingHorizontal: space[4],
  },
});
