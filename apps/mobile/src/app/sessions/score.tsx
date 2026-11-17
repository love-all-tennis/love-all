import type { Session } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  Button,
  Chip,
  ChoiceRow,
  EmptyState,
  ErrorBanner,
  Loading,
  size,
  space,
  Text,
  TextField,
  useColors,
} from "@/design";
import { fetchSession, recordResult } from "@/features/session-activity/activity-api";
import {
  addSet,
  canRecordScore,
  checkScore,
  emptyScoreDraft,
  hasFullSides,
  MAX_SETS,
  removeLastSet,
  setGames,
  setLabel,
  type ScoreContext,
  type ScoreDraft,
} from "@/features/session-activity/score";
import { authClient } from "@/lib/auth-client";

const NETWORK = "Check your connection and try again.";

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "gone" }
  | { readonly status: "ready"; readonly session: Session };

/**
 * Record score, in a form sheet: set by set from my side's point of view,
 * and for doubles who my partner was. The other side confirms it after.
 */
export default function RecordScoreSheet() {
  const palette = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: auth } = authClient.useSession();
  const meId = auth?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [generation, setGeneration] = useState(0);
  const [draft, setDraft] = useState<ScoreDraft>(emptyScoreDraft);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    fetchSession(id)
      .then(
        (session) => live && setLoaded(session ? { status: "ready", session } : { status: "gone" }),
      )
      .catch(() => live && setLoaded({ status: "error" }));
    return () => {
      live = false;
    };
  }, [id, generation]);

  const frame = (children: ReactNode) => (
    <ScrollView
      style={{ backgroundColor: palette.surface }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: "Record score" }} />
      {children}
    </ScrollView>
  );

  if (loaded.status === "loading") return frame(<Loading />);
  if (loaded.status === "error") {
    return frame(
      <EmptyState
        title="Couldn't load the session"
        body={NETWORK}
        action={{ label: "Try again", onPress: () => setGeneration((g) => g + 1) }}
      />,
    );
  }
  const session = loaded.status === "ready" ? loaded.session : null;
  if (!session || !meId || session.kind === "hitting" || !canRecordScore(session, now)) {
    return frame(
      <EmptyState
        title="No score to record"
        body="Scores are for singles and doubles sessions you played in, once they've started."
        action={{ label: "Close", onPress: () => router.back() }}
      />,
    );
  }

  const others = session.participants
    .filter((p) => p.state === "accepted" && p.player.id !== meId)
    .map((p) => p.player);
  const ctx: ScoreContext = { kind: session.kind, meId, others };
  if (!hasFullSides(ctx)) {
    const needed = session.kind === "doubles" ? "four" : "two";
    return frame(
      <EmptyState
        title="Not enough players"
        body={`A ${session.kind} score needs ${needed} players in the session.`}
        action={{ label: "Close", onPress: () => router.back() }}
      />,
    );
  }

  const check = checkScore(draft, ctx);
  const errors = tried && !check.ok ? check.errors : null;
  const doubles = session.kind === "doubles";
  const opponents = doubles
    ? others.filter((p) => p.id !== draft.partnerId).map((p) => p.displayName)
    : [others[0]!.displayName];
  const theirLabel =
    doubles && !draft.partnerId ? "Them" : opponents.length === 1 ? opponents[0]! : "Them";

  const save = async () => {
    setTried(true);
    if (!check.ok) return;
    setSaving(true);
    setProblem(null);
    try {
      const outcome = await recordResult(session.id, check.result);
      if ("refusal" in outcome) setProblem(outcome.refusal);
      else router.back();
    } catch {
      setProblem(`Couldn't save the score. ${NETWORK}`);
    } finally {
      setSaving(false);
    }
  };

  return frame(
    <>
      {doubles && (
        <View style={styles.group}>
          <Text variant="heading" accessibilityRole="header">
            Your partner
          </Text>
          <View style={styles.list} accessibilityRole="radiogroup">
            {others.map((p) => (
              <ChoiceRow
                key={p.id}
                label={p.displayName}
                selected={draft.partnerId === p.id}
                onPress={() => setDraft((d) => ({ ...d, partnerId: p.id }))}
              />
            ))}
          </View>
          {errors?.partner ? (
            <Text variant="caption" color="danger">
              {errors.partner}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.group}>
        <Text variant="heading" accessibilityRole="header">
          Sets
        </Text>
        <Text variant="caption" color="textMuted">
          {doubles && draft.partnerId
            ? `Your side against ${opponents.join(" and ")}.`
            : "Your games first. A match tiebreak can decide a third set."}
        </Text>
        {draft.sets.map((set, i) => {
          const label = setLabel(draft, i);
          const error = errors?.sets[i];
          return (
            <View key={i} style={styles.group}>
              <Text variant="subheading">{label}</Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField
                    label={doubles ? "Your side" : "You"}
                    value={set.mine}
                    onChangeText={(t) => setDraft((d) => setGames(d, i, "mine", t))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    accessibilityLabel={`${label}, your ${i === 2 && draft.thirdIsTiebreak ? "points" : "games"}`}
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label={theirLabel}
                    value={set.theirs}
                    onChangeText={(t) => setDraft((d) => setGames(d, i, "theirs", t))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    accessibilityLabel={`${label}, their ${i === 2 && draft.thirdIsTiebreak ? "points" : "games"}`}
                  />
                </View>
              </View>
              {i === 2 && (
                <View style={styles.chips}>
                  <Chip
                    label="Match tiebreak"
                    selected={draft.thirdIsTiebreak}
                    onPress={() => setDraft((d) => ({ ...d, thirdIsTiebreak: !d.thirdIsTiebreak }))}
                  />
                </View>
              )}
              {error ? (
                <Text variant="caption" color="danger">
                  {error}
                </Text>
              ) : null}
            </View>
          );
        })}
        <View style={styles.row}>
          {draft.sets.length < MAX_SETS && (
            <Button
              label={draft.sets.length === 2 ? "Add third set" : "Add a set"}
              variant="quiet"
              size="small"
              onPress={() => setDraft(addSet)}
            />
          )}
          {draft.sets.length > 1 && (
            <Button
              label="Remove last set"
              variant="quiet"
              size="small"
              onPress={() => setDraft(removeLastSet)}
            />
          )}
        </View>
        {errors?.match ? (
          <Text variant="caption" color="danger">
            {errors.match}
          </Text>
        ) : null}
      </View>

      <ErrorBanner>{problem}</ErrorBanner>
      <Button label="Save score" loading={saving} onPress={() => void save()} />
    </>,
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: size.maxContentWidth,
    alignSelf: "center",
    padding: size.gutter,
    paddingBottom: space[10],
    gap: space[6],
  },
  group: { gap: space[3] },
  list: { gap: space[2] },
  row: { flexDirection: "row", gap: space[3] },
  chips: { flexDirection: "row" },
  flex: { flex: 1 },
});
