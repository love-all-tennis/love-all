import { CLUB_ACCESS, type ClubAccess, type LatLng } from "@love-all/domain";
import {
  Accuracy,
  geocodeAsync,
  getCurrentPositionAsync,
  requestForegroundPermissionsAsync,
} from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChoiceRow,
  ErrorBanner,
  Icon,
  Screen,
  space,
  Text,
  TextField,
} from "@/design";
import { ACCESS_LABELS, addressError, nameError, optionalText } from "@/features/clubs/clubs";
import { createClub } from "@/features/clubs/clubs-api";
import { mapsUrl } from "@/features/sessions/format";

const NETWORK = "Check your connection and try again.";

/**
 * Add a club: its name, an optional address, a map pin (found from the name
 * or address, or where I'm standing) and who can play there. If the same
 * club is already listed close by, offer to open it instead.
 */
export default function NewClubScreen() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [point, setPoint] = useState<LatLng | null>(null);
  const [access, setAccess] = useState<ClubAccess | null>(null);
  const [indoor, setIndoor] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);

  const errors = tried
    ? {
        name: nameError(name),
        address: addressError(address),
        point: point ? null : "Set a map pin so players can find the courts.",
        access: access ? null : "Pick who can play there.",
      }
    : { name: null, address: null, point: null, access: null };

  const save = async () => {
    setTried(true);
    if (nameError(name) || addressError(address) || !point || !access) {
      return;
    }
    setSaving(true);
    setProblem(null);
    setExisting(null);
    try {
      const outcome = await createClub({
        name: name.trim(),
        address: optionalText(address),
        point,
        access,
        indoorCourts: indoor,
      });
      if ("existing" in outcome) {
        return setExisting(outcome.existing);
      }
      if ("refusal" in outcome) {
        return setProblem(outcome.refusal);
      }
      router.replace({ pathname: "/clubs/[id]", params: { id: outcome.ok.id } });
    } catch {
      setProblem(`Couldn't add the club. ${NETWORK}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <TextField
        label="Club name"
        hint="As players know it: Memorial Park, Franklin Racquet Club."
        value={name}
        onChangeText={setName}
        error={errors.name ?? undefined}
        autoCapitalize="words"
        returnKeyType="next"
        maxLength={140}
      />
      <TextField
        label="Address (optional)"
        hint="Street and city, so players know which one."
        value={address}
        onChangeText={setAddress}
        error={errors.address ?? undefined}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        maxLength={240}
      />
      <MapPin
        name={name}
        address={address}
        point={point}
        onChange={setPoint}
        error={errors.point}
      />

      <View style={styles.group}>
        <Text variant="heading" accessibilityRole="header">
          Who can play there
        </Text>
        {CLUB_ACCESS.map((kind) => (
          <ChoiceRow
            key={kind}
            label={ACCESS_LABELS[kind].label}
            hint={ACCESS_LABELS[kind].hint}
            selected={access === kind}
            onPress={() => setAccess(kind)}
          />
        ))}
        {errors.access ? (
          <Text variant="caption" color="danger" accessibilityRole="alert">
            {errors.access}
          </Text>
        ) : null}
        <View style={styles.row}>
          <Chip label="Has indoor courts" selected={indoor} onPress={() => setIndoor((v) => !v)} />
        </View>
      </View>

      {existing ? (
        <Card tone="sunken">
          <Text variant="bodyStrong">{existing.name} is already listed</Text>
          <Text color="textMuted">{"It's pinned close by. Review it there instead."}</Text>
          <Button
            variant="secondary"
            size="small"
            label={`Open ${existing.name}`}
            onPress={() => router.replace({ pathname: "/clubs/[id]", params: { id: existing.id } })}
          />
        </Card>
      ) : null}
      <ErrorBanner>{problem}</ErrorBanner>
      <Button label="Add club" loading={saving} onPress={() => void save()} />
    </Screen>
  );
}

/** The club's map pin: found from the address or name, or taken from where I'm standing. */
function MapPin({
  name,
  address,
  point,
  onChange,
  error,
}: {
  name: string;
  address: string;
  point: LatLng | null;
  onChange: (point: LatLng | null) => void;
  error: string | null;
}) {
  const [busy, setBusy] = useState<"search" | "here" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fromText = async () => {
    const text = address.trim() || name.trim();
    if (!text) {
      return setProblem("Type the club's name or address first, then find it.");
    }
    setBusy("search");
    setProblem(null);
    try {
      const [hit] = await geocodeAsync(text);
      if (!hit) {
        return setProblem(`Couldn't find "${text}". Try adding the city.`);
      }
      onChange({ lat: hit.latitude, lng: hit.longitude });
    } catch {
      setProblem("Map search isn't available here. Pin where you are instead.");
    } finally {
      setBusy(null);
    }
  };

  const fromHere = async () => {
    setBusy("here");
    setProblem(null);
    try {
      const { granted } = await requestForegroundPermissionsAsync();
      if (!granted) {
        return setProblem("Location is off for Love All. Find the club by name instead.");
      }
      const { coords } = await getCurrentPositionAsync({
        accuracy: Accuracy.Balanced,
      });
      onChange({ lat: coords.latitude, lng: coords.longitude });
    } catch {
      setProblem("Couldn't get your location. Find the club by name instead.");
    } finally {
      setBusy(null);
    }
  };

  if (point) {
    return (
      <Card tone="sunken">
        <View style={styles.pinned}>
          <Icon ios="mappin.and.ellipse" md="location_on" color="accent" />
          <Text style={styles.fill}>{"Map pin set. Check it's on the right courts."}</Text>
        </View>
        <View style={styles.row}>
          <Button
            variant="quiet"
            size="small"
            label="Check in Maps"
            onPress={() => void Linking.openURL(mapsUrl(point, name.trim() || "Club", Platform.OS))}
          />
          <Button variant="quiet" size="small" label="Remove pin" onPress={() => onChange(null)} />
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.group}>
      <Text variant="label" color="textMuted">
        Map pin
      </Text>
      <View style={styles.row}>
        <Button
          variant="secondary"
          size="small"
          label="Find from address"
          loading={busy === "search"}
          onPress={() => void fromText()}
        />
        <Button
          variant="secondary"
          size="small"
          label="Pin where I am"
          loading={busy === "here"}
          onPress={() => void fromHere()}
        />
      </View>
      {problem || error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {problem ?? error}
        </Text>
      ) : (
        <Text variant="caption" color="textMuted">
          Clubs are public places, so the pin is shown to everyone.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  group: { gap: space[2] },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  pinned: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
