import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { space, Text } from "@/design";
import { clockLabel } from "@/features/players/filters";
import { SlotToggle, StepScreen } from "@/features/profile/components";
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
      setProblem("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepScreen
      step={4}
      title="When you're free"
      subtitle="Tap the times you can usually play. You can skip this and add it later."
      error={problem}
      actionLabel={draft.slots.length ? "Save profile" : "Skip and save"}
      busy={saving}
      onAction={() => void finish()}
    >
      <View style={styles.grid}>
        <View style={styles.row} importantForAccessibility="no-hide-descendants">
          <View style={styles.day} />
          {DAY_PARTS.map(({ part, label, start, end }) => (
            <View key={part} style={styles.head} accessibilityElementsHidden>
              <Text variant="label">{label}</Text>
              <Text variant="caption" color="textMuted" tabular>
                {clockLabel(start)}–{clockLabel(end)}
              </Text>
            </View>
          ))}
        </View>
        {WEEKDAYS.map(({ weekday, short }) => (
          <View key={weekday} style={styles.row}>
            <Text variant="label" style={styles.day} accessibilityElementsHidden>
              {short}
            </Text>
            {DAY_PARTS.map(({ part, label }) => {
              const key = slotKey(weekday, part);

              return (
                <SlotToggle
                  key={key}
                  label={`${short} ${label.toLowerCase()}`}
                  selected={draft.slots.includes(key)}
                  onPress={() => replace(toggleSlot(draft, key))}
                />
              );
            })}
          </View>
        ))}
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  day: { width: space[10] },
  head: { flex: 1, alignItems: "center" },
});
