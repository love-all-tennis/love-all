import * as Location from "expo-location";
import { useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, Chip, ChoiceRow, Icon, space, Text, TextField } from "@/design";
import { NTRP_LEVELS, ntrpLabel } from "../profile/draft";
import { ChipChoices, Section } from "./components";
import {
  dayOptions,
  dayPartOf,
  DURATION_OPTIONS,
  HITTING_SPOT_OPTIONS,
  SESSION_KINDS,
  setKind,
  setLevelBound,
  timeOptions,
  type DraftErrors,
  type SessionDraft,
} from "./form";
import { dayChipLabel, durationLabel, mapsUrl, timeLabel } from "./format";

const levelChoices = (none: string) => [
  { value: null, label: none },
  ...NTRP_LEVELS.map((level) => ({ value: level, label: ntrpLabel(level) })),
];

/**
 * The fields of the create and edit screens. The screen owns the draft and
 * the submit button; this lays out the fields in the order a host thinks of
 * them: what, when, where, who.
 */
export function SessionForm({
  draft,
  onChange,
  errors,
  now,
  editing,
}: {
  draft: SessionDraft;
  onChange: (draft: SessionDraft) => void;
  errors: DraftErrors;
  now: Date;
  /** The kind can't change once a session exists. */
  editing: boolean;
}) {
  const set = (fields: Partial<SessionDraft>) => onChange({ ...draft, ...fields });
  const days = dayOptions(now, draft.day);
  const times = timeOptions(draft.time);

  const parts = (["Morning", "Afternoon", "Evening"] as const).map((part) => ({
    part,
    times: times.filter((t) => dayPartOf(t) === part),
  }));

  return (
    <>
      {editing ? null : (
        <Section label="Kind">
          <ChipChoices
            options={SESSION_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
            value={draft.kind}
            onChange={(kind) => onChange(setKind(draft, kind))}
          />
        </Section>
      )}

      {draft.kind === "hitting" ? (
        <Section label="Players" hint="How many, you included">
          <ChipChoices
            options={HITTING_SPOT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            value={draft.spots}
            onChange={(spots) => set({ spots })}
          />
        </Section>
      ) : null}

      <Section label="Day" error={errors.when}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
          accessibilityRole="radiogroup"
        >
          {days.map((day) => (
            <Chip
              key={day}
              label={dayChipLabel(day, now)}
              selected={draft.day === day}
              onPress={() => set({ day })}
            />
          ))}
        </ScrollView>
      </Section>

      <Section label="Start time">
        {parts.map(({ part, times: partTimes }) => (
          <View key={part} style={styles.group}>
            <Text variant="label" color="textMuted">
              {part}
            </Text>
            <ChipChoices
              options={partTimes.map((t) => ({ value: t, label: timeLabel(t) }))}
              value={draft.time}
              onChange={(time) => set({ time })}
            />
          </View>
        ))}
      </Section>

      <Section label="Length">
        <ChipChoices
          options={
            DURATION_OPTIONS.includes(draft.durationMinutes)
              ? DURATION_OPTIONS.map((m) => ({ value: m, label: durationLabel(m) }))
              : [...DURATION_OPTIONS, draft.durationMinutes]
                  .sort((a, b) => a - b)
                  .map((m) => ({ value: m, label: durationLabel(m) }))
          }
          value={draft.durationMinutes}
          onChange={(durationMinutes) => set({ durationMinutes })}
        />
      </Section>

      <Section label="Court">
        <TextField
          label="Court name"
          hint="The park or club, then the city: Palmer Park, Detroit"
          value={draft.courtName}
          onChangeText={(courtName) => set({ courtName })}
          error={errors.courtName}
          autoCapitalize="words"
          returnKeyType="done"
          maxLength={120}
        />
        <CourtPin draft={draft} onChange={set} />
      </Section>

      <Section label="Level" hint="Players outside this range can't find or join it">
        <View style={styles.group}>
          <Text variant="label" color="textMuted">
            Lowest
          </Text>
          <ChipChoices
            options={levelChoices("Any")}
            value={draft.levelMin}
            onChange={(level) => onChange(setLevelBound(draft, "min", level))}
          />
        </View>
        <View style={styles.group}>
          <Text variant="label" color="textMuted">
            Highest
          </Text>
          <ChipChoices
            options={levelChoices("Any")}
            value={draft.levelMax}
            onChange={(level) => onChange(setLevelBound(draft, "max", level))}
          />
        </View>
      </Section>

      <Section label="Who can join">
        <View style={styles.group} accessibilityRole="radiogroup">
          <ChoiceRow
            label="Open to nearby players"
            hint="Players near you in the level range can find it and ask to join"
            selected={draft.visibility === "open"}
            onPress={() => set({ visibility: "open" })}
          />
          <ChoiceRow
            label="Invite only"
            hint="Only players you invite can see it"
            selected={draft.visibility === "invite_only"}
            onPress={() => set({ visibility: "invite_only" })}
          />
        </View>
      </Section>

      <TextField
        label="Notes (optional)"
        hint="Balls, court fee, what you'd like to work on"
        value={draft.notes}
        onChangeText={(notes) => set({ notes })}
        error={errors.notes}
        multiline
        maxLength={520}
      />
    </>
  );
}

function CourtPin({
  draft,
  onChange,
}: {
  draft: SessionDraft;
  onChange: (fields: Partial<SessionDraft>) => void;
}) {
  const [busy, setBusy] = useState<"name" | "here" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fromName = async () => {
    const name = draft.courtName.trim();

    if (!name) return setProblem("Type the court's name first, then find it on the map.");
    setBusy("name");
    setProblem(null);

    try {
      const [hit] = await Location.geocodeAsync(name);

      if (!hit) return setProblem(`Couldn't find "${name}". Try adding the city.`);
      onChange({ courtPoint: { lat: hit.latitude, lng: hit.longitude } });
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
      const { granted } = await Location.requestForegroundPermissionsAsync();

      if (!granted)
        return setProblem("Location is off for Love All. Find the court by name instead.");

      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      onChange({ courtPoint: { lat: coords.latitude, lng: coords.longitude } });
    } catch {
      setProblem("Couldn't get your location. Find the court by name instead.");
    } finally {
      setBusy(null);
    }
  };

  if (draft.courtPoint) {
    return (
      <Card tone="sunken" style={styles.group}>
        <View style={styles.pinned}>
          <Icon ios="mappin.and.ellipse" md="location_on" color="accent" />
          <Text style={styles.fill}>Map pin set. Players can open it in their maps app.</Text>
        </View>
        <View style={styles.pinActions}>
          <Button
            variant="quiet"
            size="small"
            label="Check in Maps"
            onPress={() =>
              void Linking.openURL(mapsUrl(draft.courtPoint!, draft.courtName, Platform.OS))
            }
          />
          <Button
            variant="quiet"
            size="small"
            label="Remove pin"
            onPress={() => onChange({ courtPoint: null })}
          />
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.group}>
      <Text variant="caption" color="textMuted">
        A map pin is optional. It helps players find the right courts.
      </Text>
      <View style={styles.pinActions}>
        <Button
          variant="secondary"
          size="small"
          label="Pin from court name"
          loading={busy === "name"}
          onPress={() => void fromName()}
        />
        <Button
          variant="secondary"
          size="small"
          label="Pin where I am"
          loading={busy === "here"}
          onPress={() => void fromHere()}
        />
      </View>
      {problem ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  group: { gap: space[2] },
  dayStrip: { gap: space[2], paddingVertical: space[1] },
  pinned: { flexDirection: "row", alignItems: "center", gap: space[3] },
  pinActions: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
});
