import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, ErrorBanner, Loading, Screen, space, Text } from "@/design";
import { fetchMe } from "@/features/profile/profile-api";
import {
  draftErrors,
  emptyDraft,
  hasErrors,
  toNewSession,
  type SessionDraft,
} from "@/features/sessions/form";
import { SessionForm } from "@/features/sessions/session-form";
import { createSession, invitePlayers } from "@/features/sessions/sessions-api";
import { useNow } from "@/features/sessions/use-sessions";

/**
 * Sets up a match or hitting session. Opened from a profile's "Invite to
 * play" with `inviteId` and `inviteName`, it invites that player once the
 * session is saved.
 */
export default function NewSessionScreen() {
  const { inviteId, inviteName } = useLocalSearchParams<{
    inviteId?: string;
    inviteName?: string;
  }>();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((me) => live && setDraft((d) => d ?? emptyDraft(me.profile?.ntrp ?? null)))
      // Without my profile the form still works, from any level.
      .catch(() => live && setDraft((d) => d ?? emptyDraft(null)));
    return () => {
      live = false;
    };
  }, []);

  if (!draft) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading the form" />
      </Screen>
    );
  }

  const errors = tried ? draftErrors(draft, now) : {};

  const submit = async () => {
    setTried(true);
    setNotice(null);
    if (hasErrors(draftErrors(draft, new Date()))) {
      return;
    }
    setSaving(true);
    try {
      const created = await createSession(toNewSession(draft));
      if (created.kind === "refused") {
        return setNotice(created.message);
      }
      if (inviteId) {
        // The session exists now, so a failed invite is retried from its screen, not here.
        await invitePlayers(created.session.id, [inviteId]).catch(() => undefined);
      }
      router.replace({ pathname: "/sessions/[id]", params: { id: created.session.id } });
    } catch {
      setNotice("Couldn't save the session. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      {inviteId && inviteName ? (
        <Card tone="sunken">
          <Text>{`${inviteName} gets an invite once you create this session.`}</Text>
        </Card>
      ) : null}
      <SessionForm draft={draft} onChange={setDraft} errors={errors} now={now} editing={false} />
      <View style={styles.footer}>
        <ErrorBanner>
          {notice ?? (hasErrors(errors) ? "Check the fields marked above." : null)}
        </ErrorBanner>
        <Button
          label={inviteName ? `Create and invite` : "Create session"}
          loading={saving}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space[3] },
});
