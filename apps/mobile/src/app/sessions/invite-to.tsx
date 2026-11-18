import type { SessionSummary } from "@love-all/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space, Text } from "@/design";
import { SessionCard } from "@/features/sessions/components";
import { isEditable } from "@/features/sessions/format";
import { invitePlayers, listSessions } from "@/features/sessions/sessions-api";
import { useNow } from "@/features/sessions/use-sessions";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly sessions: ReadonlyArray<SessionSummary> };

/**
 * "Invite to play" from a profile: add the player to one of my upcoming
 * sessions with a spot left, or set up a new one with them invited.
 */
export default function InviteToScreen() {
  const { playerId, name } = useLocalSearchParams<{ playerId: string; name: string }>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow();

  const startNew = () =>
    router.replace({ pathname: "/sessions/new", params: { inviteId: playerId, inviteName: name } });

  useEffect(() => {
    let live = true;
    listSessions("mine")
      .then((result) => {
        if (!live) {
          return;
        }
        const now = new Date();
        const hosting =
          result.kind === "page"
            ? result.page.items.filter(
                (s) => s.me?.role === "host" && isEditable(s, now) && s.acceptedCount < s.spots,
              )
            : [];
        setLoaded({ kind: "ready", sessions: hosting });
      })
      .catch(() => live && setLoaded({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [attempt]);

  const inviteTo = async (session: SessionSummary) => {
    setSending(session.id);
    setNotice(null);
    try {
      const result = await invitePlayers(session.id, [playerId]);
      if (result.kind === "refused") {
        return setNotice(result.message);
      }
      router.replace({ pathname: "/sessions/[id]", params: { id: session.id } });
    } catch {
      setNotice("Couldn't send the invite. Check your connection and try again.");
    } finally {
      setSending(null);
    }
  };

  if (loaded.kind === "loading") {
    return (
      <Screen edges={["left", "right"]}>
        <Loading label="Loading your sessions" />
      </Screen>
    );
  }
  if (loaded.kind === "error") {
    return (
      <Screen edges={["left", "right"]}>
        <EmptyState
          title="Couldn't load your sessions"
          body="Check your connection and try again."
          action={{
            label: "Try again",
            onPress: () => {
              setLoaded({ kind: "loading" });
              setAttempt((n) => n + 1);
            },
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Button label={`New session with ${name}`} onPress={startNew} />
      {loaded.sessions.length > 0 ? (
        <View style={styles.list}>
          <Text variant="heading" accessibilityRole="header">
            Or add them to one of yours
          </Text>
          <ErrorBanner>{notice}</ErrorBanner>
          {loaded.sessions.map((session) =>
            sending === session.id ? (
              <Loading key={session.id} label="Sending invite" />
            ) : (
              <SessionCard
                key={session.id}
                session={session}
                now={now}
                showHost={false}
                onPress={() => void inviteTo(session)}
              />
            ),
          )}
        </View>
      ) : (
        <Text color="textMuted">
          {"You're not hosting any upcoming sessions with a spot left, so this sets up a new one."}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
});
