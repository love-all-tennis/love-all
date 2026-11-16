import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { Chip, StepScreen } from "@/features/profile/components";
import { DAY_PARTS, slotKey, toggleSlot, WEEKDAYS } from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";

/** Step 4: a week grid of mornings, afternoons and evenings. Saves the whole profile. */
export default function AvailabilityScreen() {
  const { draft, replace, save } = useProfileDraft();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const finish = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await save();
      router.replace("/");
    } catch {
      setProblem("We couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen
      step={4}
      title="When can you play?"
      subtitle="Tap the times you're usually free. You can skip this and add it later."
      error={problem}
      actionLabel={draft.slots.length ? "Finish" : "Skip for now"}
      busy={saving}
      onAction={() => void finish()}
    >
      <View style={styles.row}>
        <View style={styles.day} />
        {DAY_PARTS.map(({ part, label, start, end }) => (
          <View key={part} style={styles.head}>
            <ThemedText type="smallBold">{label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {start}–{end}
            </ThemedText>
          </View>
        ))}
      </View>
      {WEEKDAYS.map(({ weekday, short }) => (
        <View key={weekday} style={styles.row}>
          <ThemedText type="smallBold" style={styles.day}>
            {short}
          </ThemedText>
          {DAY_PARTS.map(({ part, label }) => {
            const key = slotKey(weekday, part);
            const on = draft.slots.includes(key);
            return (
              <Chip
                key={key}
                compact
                label={on ? "✓" : " "}
                accessibilityLabel={`${short} ${label}`}
                selected={on}
                onPress={() => replace(toggleSlot(draft, key))}
              />
            );
          })}
        </View>
      ))}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  day: { width: 40 },
  head: { flex: 1, alignItems: "center" },
});
