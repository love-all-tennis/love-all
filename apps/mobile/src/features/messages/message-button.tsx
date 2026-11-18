import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, ErrorBanner, Icon, space } from "@/design";
import { openConversation } from "./messages-api";

/**
 * Opens (or starts) my conversation with a player and goes to it. Used
 * where a conversation can start other than a profile, such as a session.
 */
export function MessagePlayerButton({
  playerId,
  name,
  label,
}: {
  playerId: string;
  name: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setProblem(null);

    try {
      const outcome = await openConversation(playerId);

      if ("refusal" in outcome) setProblem(outcome.refusal);
      else router.push({ pathname: "/messages/[id]", params: { id: outcome.ok.id, name } });
    } catch {
      setProblem("Couldn't open your messages. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.group}>
      <Button
        variant="secondary"
        size="small"
        label={label}
        icon={<Icon ios="envelope" md="mail" color="text" size="sm" />}
        loading={busy}
        onPress={() => void open()}
      />
      <ErrorBanner>{problem}</ErrorBanner>
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: space[2], alignItems: "flex-start" } });
