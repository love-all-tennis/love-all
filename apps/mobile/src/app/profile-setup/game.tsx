import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { Chip, FieldLabel, StepScreen } from "@/features/profile/components";
import {
  NTRP_HINTS,
  NTRP_LEVELS,
  ntrpLabel,
  stepError,
  type Handedness,
} from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";

const HANDS: ReadonlyArray<{ value: Handedness; label: string }> = [
  { value: "right", label: "Right-handed" },
  { value: "left", label: "Left-handed" },
];

/** Step 3: level, hand, and the kinds of tennis they're up for. */
export default function GameScreen() {
  const { draft, update } = useProfileDraft();
  const [tried, setTried] = useState(false);
  const error = stepError(draft, "game");

  return (
    <StepScreen
      step={3}
      title="Your game"
      subtitle="So we can match you with players at your level."
      error={tried ? error : null}
      actionLabel="Next"
      onAction={() => {
        setTried(true);
        if (!error) router.push("/profile-setup/availability");
      }}
    >
      <FieldLabel>NTRP level</FieldLabel>
      <View style={styles.list}>
        {NTRP_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ntrpLabel(level)}
            hint={NTRP_HINTS[level]}
            selected={draft.ntrp === level}
            onPress={() => update({ ntrp: level })}
          />
        ))}
      </View>

      <FieldLabel>Plays</FieldLabel>
      <View style={styles.row}>
        {HANDS.map(({ value, label }) => (
          <Chip
            key={value}
            compact
            label={label}
            selected={draft.handedness === value}
            onPress={() => update({ handedness: value })}
          />
        ))}
      </View>

      <FieldLabel>Open to</FieldLabel>
      <View style={styles.row}>
        <Chip
          compact
          label="Singles"
          selected={draft.playsSingles}
          onPress={() => update({ playsSingles: !draft.playsSingles })}
        />
        <Chip
          compact
          label="Doubles"
          selected={draft.playsDoubles}
          onPress={() => update({ playsDoubles: !draft.playsDoubles })}
        />
        <Chip
          compact
          label="Hitting"
          selected={draft.playsHitting}
          onPress={() => update({ playsHitting: !draft.playsHitting })}
        />
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: { flexDirection: "row", gap: Spacing.two },
});
