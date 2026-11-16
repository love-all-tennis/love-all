import { REPORT_DETAILS_MAX, type ReportReason } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, ChoiceRow, ErrorBanner, size, space, Text, TextField, useColors } from "@/design";
import { confirmBlock } from "@/features/safety/confirm-block";
import { REPORT_REASONS } from "@/features/safety/reasons";
import { blockPlayer, reportPlayer } from "@/features/safety/safety-api";

/**
 * Report a player, in a form sheet: a reason, optional details for the
 * moderators, then the offer to block them as well.
 */
export default function ReportPlayerSheet() {
  const palette = useColors();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"report" | "block" | null>(null);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async () => {
    setTried(true);
    if (!reason) return;
    setBusy("report");
    setProblem(null);
    try {
      const refusal = await reportPlayer(id, reason, details);
      if (refusal) setProblem(refusal);
      else setSent(true);
    } catch {
      setProblem("Couldn't send your report. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const block = async () => {
    setBusy("block");
    setProblem(null);
    try {
      const refusal = await blockPlayer(id);
      if (refusal) setProblem(refusal);
      // They're hidden from me now: close the sheet and their profile.
      else router.dismissTo("/players");
    } catch {
      setProblem("Couldn't block them. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.surface }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: sent ? "Report sent" : `Report ${name}` }} />
      {sent ? (
        <>
          <View style={styles.group}>
            <Text variant="heading" accessibilityRole="header">
              Thanks for telling us
            </Text>
            <Text color="textMuted">
              The moderators will look at your report about {name}. You can block them too, so you
              won't see each other.
            </Text>
          </View>
          <ErrorBanner>{problem}</ErrorBanner>
          <View style={styles.group}>
            <Button
              variant="danger"
              label={`Block ${name}`}
              loading={busy === "block"}
              onPress={() => confirmBlock(name, () => void block())}
            />
            <Button variant="secondary" label="Done" onPress={() => router.back()} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.group}>
            <Text variant="heading" accessibilityRole="header">
              Reason
            </Text>
            <View style={styles.list} accessibilityRole="radiogroup">
              {REPORT_REASONS.map((option) => (
                <ChoiceRow
                  key={option.reason}
                  label={option.label}
                  selected={reason === option.reason}
                  onPress={() => setReason(option.reason)}
                />
              ))}
            </View>
            {tried && !reason ? (
              <Text variant="caption" color="danger">
                Pick a reason for your report
              </Text>
            ) : null}
          </View>
          <TextField
            label="Details (optional)"
            hint="Anything that helps the moderators understand what happened"
            value={details}
            onChangeText={setDetails}
            maxLength={REPORT_DETAILS_MAX}
            multiline
            textAlignVertical="top"
          />
          <ErrorBanner>{problem}</ErrorBanner>
          <Button label="Send report" loading={busy === "report"} onPress={() => void send()} />
        </>
      )}
    </ScrollView>
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
});
