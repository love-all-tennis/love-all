import { MAX_INVITES_PER_REQUEST } from "@love-all/domain";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, EmptyState, ErrorBanner, Loading, Screen, space, Text } from "@/design";
import { levelLabel } from "@/features/players/components";
import { defaultFilters } from "@/features/players/filters";
import { fetchFollows, searchPlayers } from "@/features/players/players-api";
import { fetchMe } from "@/features/profile/profile-api";
import { PickPlayerRow, Section } from "@/features/sessions/components";
import { inviteCandidates, toggleInvite, type InviteCandidate } from "@/features/sessions/invites";
import { fetchSession, invitePlayers } from "@/features/sessions/sessions-api";
import { distanceLabel } from "@/lib/distance";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ready";
      readonly followed: ReadonlyArray<InviteCandidate>;
      readonly nearby: ReadonlyArray<InviteCandidate>;
    };

const metaOf = (p: InviteCandidate): string =>
  [levelLabel(p.ntrp), distanceLabel(p.distanceKm)].filter(Boolean).join(" · ");

/** The host picks players to invite: people they follow first, then players nearby. */
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [picked, setPicked] = useState<ReadonlyArray<string>>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [session, me, follows] = await Promise.all([
        fetchSession(id),
        fetchMe(),
        fetchFollows(),
      ]);
      if (!session) {
        throw new Error("missing");
      }
      // Nearby is a bonus: without a home point the list is just who I follow.
      const nearby = await searchPlayers(defaultFilters(me.profile)).catch(() => null);
      return inviteCandidates({
        session,
        myId: me.user.id,
        followed: follows.items,
        nearby: nearby?.kind === "page" ? nearby.page.items : [],
      });
    })()
      .then((lists) => live && setLoaded({ kind: "ready", ...lists }))
      .catch(() => live && setLoaded({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  const send = async () => {
    if (picked.length === 0) {
      return setNotice("Pick at least one player to invite.");
    }
    setSaving(true);
    setNotice(null);
    try {
      const result = await invitePlayers(id, picked);
      if (result.kind === "refused") {
        return setNotice(result.message);
      }
      router.back();
    } catch {
      setNotice("Couldn't send the invites. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loaded.kind === "loading") {
    return (
      <Screen edges={["left", "right"]}>
        <Loading label="Loading players" />
      </Screen>
    );
  }
  if (loaded.kind === "error") {
    return (
      <Screen edges={["left", "right"]}>
        <EmptyState
          title="Couldn't load players"
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

  const list = (players: ReadonlyArray<InviteCandidate>) => (
    <View style={styles.list}>
      {players.map((player) => (
        <PickPlayerRow
          key={player.id}
          player={player}
          meta={metaOf(player)}
          selected={picked.includes(player.id)}
          onPress={() => {
            setNotice(null);
            const next = toggleInvite(picked, player.id);
            if (next === picked) {
              setNotice(`You can invite up to ${MAX_INVITES_PER_REQUEST} players at a time.`);
            }
            setPicked(next);
          }}
        />
      ))}
    </View>
  );

  const nobody = loaded.followed.length === 0 && loaded.nearby.length === 0;

  return (
    <Screen edges={["left", "right", "bottom"]}>
      {nobody ? (
        <EmptyState
          title="Nobody to invite yet"
          body="Follow players from their profile, or set your home area to find players nearby."
        />
      ) : null}
      {loaded.followed.length > 0 ? (
        <Section label="People you follow">{list(loaded.followed)}</Section>
      ) : null}
      {loaded.nearby.length > 0 ? (
        <Section label="Nearby at your level">{list(loaded.nearby)}</Section>
      ) : null}
      {nobody ? null : (
        <View style={styles.footer}>
          <ErrorBanner>{notice}</ErrorBanner>
          <Text variant="caption" color="textMuted">
            Invited players can accept or decline. Only accepted players take a spot.
          </Text>
          <Button
            label={picked.length > 1 ? `Send ${picked.length} invites` : "Send invite"}
            loading={saving}
            onPress={() => void send()}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
  footer: { gap: space[3] },
});
