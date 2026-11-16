import type { FollowedPlayers, Me } from "@love-all/domain";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { PlayerRow } from "@/features/players/components";
import {
  defaultFilters,
  filtersSummary,
  PLAY_KINDS,
  RADIUS_OPTIONS_KM,
  setLevelBound,
  togglePlay,
  type PlayerFilters,
} from "@/features/players/filters";
import { fetchFollows } from "@/features/players/players-api";
import { usePlayerSearch } from "@/features/players/use-player-search";
import { Chip, FieldLabel, PrimaryButton } from "@/features/profile/components";
import { NTRP_LEVELS, ntrpLabel } from "@/features/profile/draft";
import { fetchMe } from "@/features/profile/profile-api";

type Tab = "nearby" | "following";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });

/** Find players nearby with filters, or the ones I follow for later. */
export default function PlayersScreen() {
  const [view, setView] = useState<Tab>("nearby");

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Players</ThemedText>
          <View style={styles.row} accessibilityRole="tablist">
            <Chip
              compact
              label="Nearby"
              selected={view === "nearby"}
              onPress={() => setView("nearby")}
            />
            <Chip
              compact
              label="Following"
              selected={view === "following"}
              onPress={() => setView("following")}
            />
          </View>
        </View>
        {view === "nearby" ? <NearbyPlayers /> : <FollowedList />}
      </SafeAreaView>
    </ThemedView>
  );
}

function NearbyPlayers() {
  const [me, setMe] = useState<Me | null>(null);
  const [filters, setFilters] = useState<PlayerFilters | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const search = usePlayerSearch(filters);

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((loaded) => {
        if (!live) return;
        setMe(loaded);
        setFilters(defaultFilters(loaded.profile));
      })
      // Without my profile the list still works, from the widest defaults.
      .catch(() => live && setFilters(defaultFilters(null)));
    return () => {
      live = false;
    };
  }, []);

  if (!filters) return <Centered busy />;

  const header = (
    <View style={styles.filters}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showFilters }}
        accessibilityHint="Shows the distance, level and play filters"
        onPress={() => setShowFilters((open) => !open)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <ThemedText type="small" themeColor="textSecondary">
          {filtersSummary(filters)}
        </ThemedText>
        <ThemedText type="linkPrimary">{showFilters ? "Done" : "Change filters"}</ThemedText>
      </Pressable>
      {showFilters ? <FilterPanel filters={filters} onChange={setFilters} /> : null}
    </View>
  );

  if (search.status === "needsHomePoint") {
    return (
      <View style={styles.list}>
        {header}
        <Message
          title="Set where you play"
          body="We need a home area to find players near you."
          action={{ label: "Set home area", onPress: () => router.push("/profile-setup/home") }}
        />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={search.status === "ready" ? search.players : []}
      keyExtractor={(player) => player.id}
      renderItem={({ item }) => <PlayerRow player={item} onPress={() => openPlayer(item.id)} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        search.status === "loading" ? (
          <Centered busy />
        ) : search.status === "error" ? (
          <Message
            title="Couldn't load players"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: search.refresh }}
          />
        ) : (
          <Message
            title="No players match yet"
            body={
              me?.profile?.metro
                ? `Try a wider distance or level range. ${me.profile.metro.name} is just getting started.`
                : "Try a wider distance or level range."
            }
          />
        )
      }
      ListFooterComponent={search.loadingMore ? <ActivityIndicator /> : undefined}
      onEndReached={search.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={false} onRefresh={search.refresh} />}
    />
  );
}

function FilterPanel({
  filters,
  onChange,
}: {
  filters: PlayerFilters;
  onChange: (next: PlayerFilters) => void;
}) {
  return (
    <View style={styles.panel}>
      <FieldLabel>Distance</FieldLabel>
      <View style={styles.wrap}>
        {RADIUS_OPTIONS_KM.map((km) => (
          <Chip
            key={km}
            label={`${km} km`}
            selected={filters.radiusKm === km}
            onPress={() => onChange({ ...filters, radiusKm: km })}
          />
        ))}
      </View>

      <FieldLabel>Lowest level</FieldLabel>
      <View style={styles.wrap}>
        {NTRP_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ntrpLabel(level)}
            accessibilityLabel={`Lowest level ${ntrpLabel(level)}`}
            selected={filters.levelMin === level}
            onPress={() => onChange(setLevelBound(filters, "min", level))}
          />
        ))}
      </View>

      <FieldLabel>Highest level</FieldLabel>
      <View style={styles.wrap}>
        {NTRP_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ntrpLabel(level)}
            accessibilityLabel={`Highest level ${ntrpLabel(level)}`}
            selected={filters.levelMax === level}
            onPress={() => onChange(setLevelBound(filters, "max", level))}
          />
        ))}
      </View>

      <FieldLabel>Open to</FieldLabel>
      <View style={styles.row}>
        {PLAY_KINDS.map(({ kind, label }) => (
          <Chip
            key={kind}
            compact
            label={label}
            selected={filters.plays === kind}
            onPress={() => onChange(togglePlay(filters, kind))}
          />
        ))}
      </View>
    </View>
  );
}

function FollowedList() {
  const [follows, setFollows] = useState<FollowedPlayers | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let live = true;
    setFailed(false);
    fetchFollows()
      .then((loaded) => live && setFollows(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  // Reload on focus, so following or unfollowing on a profile shows up here.
  useFocusEffect(load);

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={follows?.items ?? []}
      keyExtractor={(player) => player.id}
      renderItem={({ item }) => <PlayerRow player={item} onPress={() => openPlayer(item.id)} />}
      ListEmptyComponent={
        failed ? (
          <Message
            title="Couldn't load who you follow"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: () => void load() }}
          />
        ) : follows ? (
          <Message
            title="Nobody saved yet"
            body="Follow players from their profile to find them here later."
          />
        ) : (
          <Centered busy />
        )
      }
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
    />
  );
}

function Centered({ busy }: { busy: boolean }) {
  return <View style={styles.centered}>{busy ? <ActivityIndicator /> : null}</View>;
}

function Message({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.message}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
      {action ? <PrimaryButton label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  list: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  filters: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  panel: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  centered: {
    paddingVertical: Spacing.five,
    alignItems: "center",
  },
  message: {
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },
});
