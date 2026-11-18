import { REPORT_DETAILS_MAX, type ReportReason, type ReportTargetType } from "@love-all/domain";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, ChoiceRow, ErrorBanner, size, space, Text, TextField, useColors } from "@/design";

import { confirmBlock } from "./confirm-block";
import { reasonsFor } from "./reasons";
import { blockPlayer, sendReport } from "./safety-api";

export interface ReportSheetProps {
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  /** The player responsible: the reported player, or the author. */
  readonly author: { readonly id: string; readonly name: string };
  /** Header before sending, such as "Report Sam" or "Report post". */
  readonly title: string;
  /** What the thanks note says the moderators will look at, such as "this post". */
  readonly subject: string;
  /** Where to go after blocking, since the author's profile or posts are hidden from then on. */
  readonly afterBlock: () => void;
}

/**
 * Report a player or a post, in a form sheet: a reason, optional details for
 * the moderators, then the offer to block the player as well.
 */
export function ReportSheet({
  targetType,
  targetId,
  author,
  title,
  subject,
  afterBlock,
}: ReportSheetProps) {
  const palette = useColors();
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
      const refusal = await sendReport(targetType, targetId, reason, details);
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
      const refusal = await blockPlayer(author.id);
      if (refusal) setProblem(refusal);
      else afterBlock();
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
      <Stack.Screen options={{ title: sent ? "Report sent" : title }} />
      {sent ? (
        <>
          <View style={styles.group}>
            <Text variant="heading" accessibilityRole="header">
              Thanks for telling us
            </Text>
            <Text color="textMuted">
              The moderators will look at your report about {subject}. You can block {author.name}{" "}
              too, so you won't see each other.
            </Text>
          </View>
          <ErrorBanner>{problem}</ErrorBanner>
          <View style={styles.group}>
            <Button
              variant="danger"
              label={`Block ${author.name}`}
              loading={busy === "block"}
              onPress={() => confirmBlock(author.name, () => void block())}
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
              {reasonsFor(targetType).map((option) => (
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
