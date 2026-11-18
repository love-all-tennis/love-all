import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Chip, ChoiceRow, space } from "@/design";
import { ChipRow, FieldGroup, StepScreen } from "@/features/profile/components";
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
        if (!error) {
          router.push("/profile-setup/availability");
        }
      }}
    >
      <FieldGroup label="NTRP level">
        <View style={styles.list} accessibilityRole="radiogroup">
          {NTRP_LEVELS.map((level) => (
            <ChoiceRow
              key={level}
              label={`NTRP ${ntrpLabel(level)}`}
              hint={NTRP_HINTS[level]}
              selected={draft.ntrp === level}
              onPress={() => update({ ntrp: level })}
            />
          ))}
        </View>
      </FieldGroup>

      <FieldGroup label="Plays">
        <ChipRow>
          {HANDS.map(({ value, label }) => (
            <Chip
              key={value}
              label={label}
              selected={draft.handedness === value}
              onPress={() => update({ handedness: value })}
            />
          ))}
        </ChipRow>
      </FieldGroup>

      <FieldGroup label="Open to">
        <ChipRow>
          <Chip
            label="Singles"
            selected={draft.playsSingles}
            onPress={() => update({ playsSingles: !draft.playsSingles })}
          />
          <Chip
            label="Doubles"
            selected={draft.playsDoubles}
            onPress={() => update({ playsDoubles: !draft.playsDoubles })}
          />
          <Chip
            label="Hitting"
            selected={draft.playsHitting}
            onPress={() => update({ playsHitting: !draft.playsHitting })}
          />
        </ChipRow>
      </FieldGroup>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
});
