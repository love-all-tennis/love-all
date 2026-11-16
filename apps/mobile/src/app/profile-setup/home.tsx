import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, Divider, Icon, space, Text, TextField } from "@/design";
import { StepScreen } from "@/features/profile/components";
import { roundPoint, stepError, type HomeArea } from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";

const describe = (area: HomeArea): string =>
  area.kind === "city" ? area.label : "Near your current location";

/** Step 2: where they play from, as a city or a pin from their location. */
export default function HomeAreaScreen() {
  const { draft, update } = useProfileDraft();
  const [city, setCity] = useState(draft.homeArea?.kind === "city" ? draft.homeArea.label : "");
  const [busy, setBusy] = useState<"city" | "pin" | null>(null);
  const [cityProblem, setCityProblem] = useState<string | null>(null);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const error = stepError(draft, "home");

  const findCity = async () => {
    const label = city.trim();
    setPinProblem(null);
    if (!label) return setCityProblem("Type a city first, like Royal Oak, MI");
    setBusy("city");
    setCityProblem(null);
    try {
      const [hit] = await Location.geocodeAsync(label);
      if (!hit) return setCityProblem(`Couldn't find "${label}". Try adding the state.`);
      update({
        homeArea: {
          kind: "city",
          label,
          point: roundPoint({ lat: hit.latitude, lng: hit.longitude }),
        },
      });
    } catch {
      setCityProblem("City search isn't available here. Use your location instead.");
    } finally {
      setBusy(null);
    }
  };

  const usePin = async () => {
    setBusy("pin");
    setPinProblem(null);
    setCityProblem(null);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setPinProblem("Location is off for Love All. Type your city instead.");
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
      setPinProblem("Couldn't get your location. Type your city instead.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <StepScreen
      step={2}
      title="Where you play"
      subtitle="We use this to find players near you. It's rounded to about half a mile and never shown as an exact spot."
      error={pinProblem ?? (tried ? error : null)}
      actionLabel="Next"
      onAction={() => {
        setTried(true);
        if (!error) router.push("/profile-setup/game");
      }}
    >
      <View style={styles.group}>
        <TextField
          label="City"
          value={city}
          onChangeText={setCity}
          error={cityProblem ?? undefined}
          placeholder="Royal Oak, MI"
          autoCapitalize="words"
          autoComplete="postal-address-locality"
          textContentType="addressCity"
          returnKeyType="search"
          onSubmitEditing={() => void findCity()}
        />
        <Button
          variant="secondary"
          label="Find city"
          loading={busy === "city"}
          onPress={() => void findCity()}
        />
      </View>

      <Divider label="or" />

      <Button
        variant="secondary"
        label="Use my current location"
        icon={<Icon ios="location" md="my_location" color="text" />}
        loading={busy === "pin"}
        onPress={() => void usePin()}
      />

      {draft.homeArea ? (
        <Card tone="sunken">
          <Text variant="label" color="textMuted">
            Home area
          </Text>
          <Text variant="bodyStrong">{describe(draft.homeArea)}</Text>
        </Card>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
});
