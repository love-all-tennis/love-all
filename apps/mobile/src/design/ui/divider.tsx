import { StyleSheet, View } from "react-native";

import { size, space } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

/** A hairline with a word in the middle, such as "or" between two ways to do one thing. */
export function Divider({ label }: { label: string }) {
  const palette = useColors();
  return (
    <View style={styles.divider}>
      <View style={[styles.rule, { backgroundColor: palette.border }]} />
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: palette.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rule: { flex: 1, height: size.hairline },
});
