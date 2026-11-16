import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { FieldLabel, SecondaryButton, StepScreen } from "@/features/profile/components";
import { roundPoint, stepError, type HomeArea } from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";
import { useTheme } from "@/hooks/use-theme";

const describe = (area: HomeArea): string =>
  area.kind === "city"
    ? area.label
    : `Pin near ${area.point.lat.toFixed(2)}, ${area.point.lng.toFixed(2)}`;

/** Step 2: where they play from, as a city or a pin from their location. */
export default function HomeAreaScreen() {
  const theme = useTheme();
  const { draft, update } = useProfileDraft();
  const [city, setCity] = useState(draft.homeArea?.kind === "city" ? draft.homeArea.label : "");
  const [busy, setBusy] = useState<"city" | "pin" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const error = stepError(draft, "home");

  const findCity = async () => {
    const label = city.trim();
    if (!label) return setProblem("Type a city first, like Royal Oak, MI.");
    setBusy("city");
    setProblem(null);
    try {
      const [hit] = await Location.geocodeAsync(label);
      if (!hit) return setProblem(`We couldn't find "${label}". Try adding the state.`);
      update({
        homeArea: {
          kind: "city",
          label,
          point: roundPoint({ lat: hit.latitude, lng: hit.longitude }),
        },
      });
    } catch {
      setProblem("City search isn't available here. Use your location instead.");
    } finally {
      setBusy(null);
    }
  };

  const usePin = async () => {
    setBusy("pin");
    setProblem(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setProblem("Location is off for Love All. Type your city instead.");
      // Low accuracy is plenty: we only keep about 1 km.
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      update({
        homeArea: {
          kind: "pin",
          point: roundPoint({ lat: coords.latitude, lng: coords.longitude }),
        },
      });
    } catch {
      setProblem("We couldn't get your location. Type your city instead.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <StepScreen
      step={2}
      title="Where do you play?"
      subtitle="We use this to find players near you. It's kept to about 1 km and never shown as an exact spot."
      error={problem ?? (tried ? error : null)}
      actionLabel="Next"
      onAction={() => {
        setTried(true);
        if (!error) router.push("/profile-setup/game");
      }}
    >
      <FieldLabel>City</FieldLabel>
      <View style={styles.row}>
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="Royal Oak, MI"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          autoComplete="postal-address-locality"
          returnKeyType="search"
          onSubmitEditing={() => void findCity()}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <View style={styles.find}>
          <SecondaryButton label="Find" busy={busy === "city"} onPress={() => void findCity()} />
        </View>
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.or}>
        or
      </ThemedText>
      <SecondaryButton
        label="Use my current location"
        busy={busy === "pin"}
        onPress={() => void usePin()}
      />

      {draft.homeArea ? (
        <View style={[styles.picked, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Home area
          </ThemedText>
          <ThemedText type="smallBold">{describe(draft.homeArea)}</ThemedText>
        </View>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: Spacing.two, alignItems: "center" },
  input: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    fontSize: 16,
  },
  find: { width: 88 },
  or: { textAlign: "center" },
  picked: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
});
