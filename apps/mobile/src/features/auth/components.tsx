import { Pressable, StyleSheet, View } from "react-native";

import { Icon, motion, radius, size, space, Text, useColors } from "@/design";

/** A yes-or-no box with its label beside it, such as the 18+ confirmation. */
export function Checkbox({
  checked,
  onChange,
  label,
  error,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Shown under the label once a submit needs it ticked. */
  error?: string | null;
}) {
  const palette = useColors();
  const edge = error ? palette.danger : checked ? palette.accent : palette.borderStrong;

  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        onPress={() => onChange(!checked)}
        style={({ pressed }) => [styles.row, pressed && { opacity: motion.pressOpacity }]}
      >
        <View
          style={[
            styles.box,
            { borderColor: edge, backgroundColor: checked ? palette.accent : palette.surface },
          ]}
        >
          {checked ? <Icon ios="checkmark" md="check" size="sm" color="onAccent" /> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const BOX = size.icon.lg;

const styles = StyleSheet.create({
  field: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.minTap },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.sm,
    borderCurve: "continuous",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
});
