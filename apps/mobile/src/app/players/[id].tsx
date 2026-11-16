import type { PlayerProfile } from "@love-all/domain";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { PlayerAvatar } from "@/features/players/components";
import { availabilityLines, distanceLabel, playsLabel } from "@/features/players/filters";
import { fetchFollows, fetchPlayer, setFollowing } from "@/features/players/players-api";
import { FieldLabel, PrimaryButton, SecondaryButton } from "@/features/profile/components";
import { ntrpLabel } from "@/features/profile/draft";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly player: PlayerProfile; readonly following: boolean };

/** Another player's profile, with invite and follow-for-later. */
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  // Tagged with the request it answers, so a new id or a retry shows loading.
  const [loaded, setLoaded] = useState<{ key: string; state: Loaded } | null>(null);
  const state: Loaded = loaded?.key === key ? loaded.state : { kind: "loading" };
  const setState = (next: Loaded) => setLoaded({ key, state: next });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const settle = (next: Loaded) => live && setLoaded({ key, state: next });
    Promise.all([fetchPlayer(id), fetchFollows()])
      .then(([player, follows]) => {
        if (!player) return settle({ kind: "missing" });
        const following = follows.items.some((p) => p.id === player.id);
        settle({ kind: "ready", player, following });
      })
      .catch(() => settle({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [id, key]);

  const toggleFollow = async () => {
    if (state.kind !== "ready") return;
    const next = !state.following;
    setSaving(true);
    setNotice(null);
    try {
      const refusal = await setFollowing(state.player.id, next);
      if (refusal) setNotice(refusal);
      else setState({ ...state, following: next });
    } catch {
      setNotice("Couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const title = state.kind === "ready" ? state.player.displayName : "";

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
    >
      <Stack.Screen options={{ title }} />
      <View style={styles.inner}>
        {state.kind === "loading" ? <ActivityIndicator style={styles.spinner} /> : null}
        {state.kind === "missing" ? (
          <Notice
            title="Player not found"
            body="They may have removed their profile, or the link is out of date."
          />
        ) : null}
        {state.kind === "error" ? (
          <>
            <Notice
              title="Couldn't load this profile"
              body="Check your connection and try again."
            />
            <PrimaryButton label="Try again" onPress={() => setAttempt((n) => n + 1)} />
          </>
        ) : null}
        {state.kind === "ready" ? (
          <ProfileBody
            player={state.player}
            isMe={session?.user.id === state.player.id}
            following={state.following}
            saving={saving}
            notice={notice}
            onToggleFollow={() => void toggleFollow()}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

function ProfileBody({
  player,
  isMe,
  following,
  saving,
  notice,
  onToggleFollow,
}: {
  player: PlayerProfile;
  isMe: boolean;
  following: boolean;
  saving: boolean;
  notice: string | null;
  onToggleFollow: () => void;
}) {
  const where = [player.metro?.name, distanceLabel(player.distanceKm)].filter(Boolean).join(" · ");
  const game = [
    player.ntrp ? `NTRP ${ntrpLabel(player.ntrp)}` : "No rating yet",
    player.handedness === "left"
      ? "Left-handed"
      : player.handedness === "right"
        ? "Right-handed"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const schedule = availabilityLines(player.availability);

  return (
    <>
      <View style={styles.hero}>
        <PlayerAvatar name={player.displayName} photoUrl={player.photoUrl} size={96} />
        <ThemedText type="subtitle" style={styles.center}>
          {player.displayName}
        </ThemedText>
        {where ? (
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {where}
          </ThemedText>
        ) : null}
      </View>

      {isMe ? null : (
        <View style={styles.actions}>
          {/* Sessions (#13) will open the invite flow from here. */}
          <PrimaryButton label="Invite to play" onPress={() => undefined} disabled />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Invites open once matches and hitting sessions arrive.
          </ThemedText>
          <SecondaryButton
            label={following ? "Following ✓" : "Follow for later"}
            onPress={onToggleFollow}
            busy={saving}
          />
          {notice ? (
            <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
              {notice}
            </ThemedText>
          ) : null}
        </View>
      )}

      <Section label="Game">
        <ThemedText>{game}</ThemedText>
        <ThemedText themeColor="textSecondary">Open to: {playsLabel(player)}</ThemedText>
      </Section>

      {player.bio ? (
        <Section label="About">
          <ThemedText>{player.bio}</ThemedText>
        </Section>
      ) : null}

      <Section label="Usually free">
        {schedule.length > 0 ? (
          schedule.map((line) => <ThemedText key={line}>{line}</ThemedText>)
        ) : (
          <ThemedText themeColor="textSecondary">No times set yet</ThemedText>
        )}
      </Section>
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  inner: {
    width: "100%",
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
  },
  spinner: {
    paddingVertical: Spacing.five,
  },
  hero: {
    alignItems: "center",
    gap: Spacing.two,
  },
  center: {
    textAlign: "center",
  },
  actions: {
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.one,
  },
});
