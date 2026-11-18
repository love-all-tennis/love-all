import type { PlayerProfile } from "@love-all/domain";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Icon,
  Loading,
  Screen,
  space,
  Tag,
  Text,
} from "@/design";
import { levelLabel } from "@/features/players/components";
import { availabilityLines } from "@/features/players/filters";
import { openConversation } from "@/features/messages/messages-api";
import { fetchFollows, fetchPlayer, setFollowing } from "@/features/players/players-api";
import { confirmBlock } from "@/features/safety/confirm-block";
import { blockPlayer } from "@/features/safety/safety-api";
import { authClient } from "@/lib/auth-client";
import { distanceLabel } from "@/lib/distance";

type Saving = "follow" | "block" | "message" | null;

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly player: PlayerProfile; readonly following: boolean };

/** Another player's profile, with invite, message, follow-for-later, report and block. */
export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  // Tagged with the request it answers, so a new id or a retry shows loading.
  const [loaded, setLoaded] = useState<{ key: string; state: Loaded } | null>(null);
  const state: Loaded = loaded?.key === key ? loaded.state : { kind: "loading" };
  const setState = (next: Loaded) => setLoaded({ key, state: next });
  const [saving, setSaving] = useState<Saving>(null);
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
    setSaving("follow");
    setNotice(null);
    try {
      const refusal = await setFollowing(state.player.id, next);
      if (refusal) setNotice(refusal);
      else setState({ ...state, following: next });
    } catch {
      setNotice("Couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  const message = async (player: PlayerProfile) => {
    setSaving("message");
    setNotice(null);
    try {
      const outcome = await openConversation(player.id);
      if ("refusal" in outcome) setNotice(outcome.refusal);
      else
        router.push({
          pathname: "/messages/[id]",
          params: { id: outcome.ok.id, name: player.displayName },
        });
    } catch {
      setNotice("Couldn't open your messages. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  const block = async (player: PlayerProfile) => {
    setSaving("block");
    setNotice(null);
    try {
      const refusal = await blockPlayer(player.id);
      if (refusal) setNotice(refusal);
      // They're hidden from me now, so leave their profile.
      else router.back();
    } catch {
      setNotice("Couldn't block them. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  };

  const title = state.kind === "ready" ? state.player.displayName : "";

  return (
    // The stack's native header sits above, so only pad the other edges.
    <Screen edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ title }} />
      {state.kind === "loading" ? <Loading label="Loading profile" /> : null}
      {state.kind === "missing" ? (
        <EmptyState
          title="Player not found"
          body="They may have removed their profile, or the link is out of date."
          action={{ label: "Back to players", onPress: () => router.back() }}
        />
      ) : null}
      {state.kind === "error" ? (
        <EmptyState
          title="Couldn't load this profile"
          body="Check your connection and try again."
          action={{ label: "Try again", onPress: () => setAttempt((n) => n + 1) }}
        />
      ) : null}
      {state.kind === "ready" ? (
        <ProfileBody
          player={state.player}
          isMe={session?.user.id === state.player.id}
          following={state.following}
          saving={saving}
          notice={notice}
          onToggleFollow={() => void toggleFollow()}
          onMessage={() => void message(state.player)}
          onReport={() =>
            router.push({
              pathname: "/players/report",
              params: { id: state.player.id, name: state.player.displayName },
            })
          }
          onBlock={() => confirmBlock(state.player.displayName, () => void block(state.player))}
        />
      ) : null}
    </Screen>
  );
}

function ProfileBody({
  player,
  isMe,
  following,
  saving,
  notice,
  onToggleFollow,
  onMessage,
  onReport,
  onBlock,
}: {
  player: PlayerProfile;
  isMe: boolean;
  following: boolean;
  saving: Saving;
  notice: string | null;
  onToggleFollow: () => void;
  onMessage: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const where = [player.metro?.name, distanceLabel(player.distanceKm)].filter(Boolean).join(" · ");
  const hand =
    player.handedness === "left"
      ? "Left-handed"
      : player.handedness === "right"
        ? "Right-handed"
        : null;
  const formats = [
    player.playsSingles && "Singles",
    player.playsDoubles && "Doubles",
    player.playsHitting && "Hitting",
  ].filter((f): f is string => typeof f === "string");
  const schedule = availabilityLines(player.availability);

  return (
    <>
      <View style={styles.hero}>
        <Avatar name={player.displayName} photoUrl={player.photoUrl} size="xl" />
        <View style={styles.heroText}>
          <Text variant="title" style={styles.center}>
            {player.displayName}
          </Text>
          {where ? (
            <Text color="textMuted" style={styles.center}>
              {where}
            </Text>
          ) : null}
        </View>
      </View>

      {isMe ? null : (
        <View style={styles.actions}>
          <Button
            label="Invite to play"
            accessibilityHint="Invites them to a new session or one of yours"
            onPress={() =>
              router.push({
                pathname: "/sessions/invite-to",
                params: { playerId: player.id, name: player.displayName },
              })
            }
          />
          <Button
            variant="secondary"
            label="Send message"
            icon={<Icon ios="envelope" md="mail" color="text" size="sm" />}
            onPress={onMessage}
            loading={saving === "message"}
          />
          <Button
            variant="secondary"
            label={following ? "Following" : "Follow for later"}
            icon={
              following ? (
                <Icon ios="checkmark" md="check" color="text" size="sm" />
              ) : (
                <Icon ios="plus" md="add" color="text" size="sm" />
              )
            }
            accessibilityHint={following ? "Stops following them" : undefined}
            onPress={onToggleFollow}
            loading={saving === "follow"}
          />
          <ErrorBanner>{notice}</ErrorBanner>
        </View>
      )}

      <Section label="Game">
        <View style={styles.tags}>
          <Tag label={levelLabel(player.ntrp)} />
          {formats.map((format) => (
            <Tag key={format} label={format} />
          ))}
        </View>
        {hand ? <Text color="textMuted">{hand}</Text> : null}
        {formats.length === 0 ? <Text color="textMuted">Hasn't said how they play yet</Text> : null}
      </Section>

      {player.bio ? (
        <Section label="About">
          <Text>{player.bio}</Text>
        </Section>
      ) : null}

      <Section label="Usually free">
        {schedule.length > 0 ? (
          schedule.map((line) => (
            <Text key={line} tabular>
              {line}
            </Text>
          ))
        ) : (
          <Text color="textMuted">No times set yet</Text>
        )}
      </Section>

      {isMe ? null : (
        <Card>
          <Text variant="subheading">Safety</Text>
          <Text variant="caption" color="textMuted">
            Reports go to the Love All moderators. Blocking hides you from each other.
          </Text>
          <View style={styles.safety}>
            <Button variant="secondary" size="small" label="Report player" onPress={onReport} />
            <Button
              variant="danger"
              size="small"
              label="Block player"
              loading={saving === "block"}
              onPress={onBlock}
            />
          </View>
        </Card>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space[3], paddingTop: space[2] },
  heroText: { alignItems: "center", gap: space[1] },
  center: { textAlign: "center" },
  actions: { gap: space[3] },
  section: { gap: space[2] },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  safety: { flexDirection: "row", flexWrap: "wrap", gap: space[3], paddingTop: space[1] },
});
