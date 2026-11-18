import { Pressable, StyleSheet, View } from "react-native";

import { motion, radius, size, space } from "../tokens";
import { useColors } from "../use-tokens";
import { Icon } from "./icon";
import { Text } from "./text";

/**
 * A pick-one row with a title and a line of explanation, such as an NTRP
 * level and what it means, or a report reason. Put a set of them in a View
 * with `accessibilityRole="radiogroup"`.
 */
export function ChoiceRow({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected
          ? { backgroundColor: palette.accentSoft, borderColor: palette.accent }
          : { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && { opacity: motion.pressOpacity },
      ]}
    >
      <View style={styles.choiceText}>
        <Text variant="bodyStrong" color={selected ? "onAccentSoft" : "text"} tabular>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={selected ? "onAccentSoft" : "textMuted"}>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon ios="checkmark" md="check" color="onAccentSoft" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: size.minTap,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: size.hairline,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  choiceText: { flex: 1, gap: space[1] / 2 },
});
