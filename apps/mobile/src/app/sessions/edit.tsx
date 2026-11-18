import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space } from "@/design";
import {
  draftErrors,
  draftFromSession,
  hasErrors,
  toSessionPatch,
  type SessionDraft,
} from "@/features/sessions/form";
import { SessionForm } from "@/features/sessions/session-form";
import { updateSession } from "@/features/sessions/sessions-api";
import { useNow, useSessionDetail } from "@/features/sessions/use-sessions";

/** The host changes a session's time, court, level range, spots, visibility or notes. */
export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useSessionDetail(id);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  if (state.kind === "loading") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading the session" />
      </Screen>
    );
  }
  if (state.kind !== "ready") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <EmptyState
          title="Couldn't load this session"
          body="Check your connection and try again."
          action={{ label: "Try again", onPress: reload }}
        />
      </Screen>
    );
  }

  const saved = state.session;
  // Start from the saved session until the host changes something.
  const current = draft ?? draftFromSession(saved);
  const errors = tried ? draftErrors(current, now) : {};

  const submit = async () => {
    setTried(true);
    setNotice(null);
    if (hasErrors(draftErrors(current, new Date()))) return;
    const patch = toSessionPatch(current, saved);
    if (Object.keys(patch).length === 0) return router.back();
    setSaving(true);
    try {
      const result = await updateSession(saved.id, patch);
      if (result.kind === "refused") return setNotice(result.message);
      router.back();
    } catch {
      setNotice("Couldn't save your changes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <SessionForm draft={current} onChange={setDraft} errors={errors} now={now} editing />
      <View style={styles.footer}>
        <ErrorBanner>
          {notice ?? (hasErrors(errors) ? "Check the fields marked above." : null)}
        </ErrorBanner>
        <Button label="Save changes" loading={saving} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space[3] },
});
