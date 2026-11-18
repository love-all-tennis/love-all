import type { FollowedPlayers, Me } from "@love-all/domain";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Loading,
  Screen,
  size,
  space,
  Text,
  useColors,
} from "@/design";
import { PlayerRow } from "@/features/players/components";
import { setPlayerFilters, usePlayerFilters } from "@/features/players/filter-store";
import { defaultFilters, filtersSummary } from "@/features/players/filters";
import { fetchFollows } from "@/features/players/players-api";
import { usePlayerSearch } from "@/features/players/use-player-search";
import { fetchMe } from "@/features/profile/profile-api";
import { radiusLabel } from "@/lib/distance";

type Showing = "nearby" | "following";

const openPlayer = (id: string) => router.push({ pathname: "/players/[id]", params: { id } });
const openFilters = () => router.push("/players/filters");

/** Find players nearby with filters, or the ones I follow for later. */
export default function PlayersScreen() {
  const [view, setView] = useState<Showing>("nearby");

  return (
    <Screen title="Players" scroll={false} edges={["top", "left", "right"]}>
      <View style={styles.switcher}>
        <Chip label="Nearby" selected={view === "nearby"} onPress={() => setView("nearby")} />
        <Chip
          label="Following"
          selected={view === "following"}
          onPress={() => setView("following")}
        />
      </View>
      <View style={styles.fill}>{view === "nearby" ? <NearbyPlayers /> : <FollowedList />}</View>
    </Screen>
  );
}

function NearbyPlayers() {
  const palette = useColors();
  const [me, setMe] = useState<Me | null>(null);
  const filters = usePlayerFilters();
  const search = usePlayerSearch(filters);

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((loaded) => {
        if (!live) {
          return;
        }
        setMe(loaded);
        // Start from my own radius and level, unless I've already changed the filters.
        if (!filters) {
          setPlayerFilters(defaultFilters(loaded.profile));
        }
      })
      // Without my profile the list still works, from the widest defaults.
      .catch(() => live && !filters && setPlayerFilters(defaultFilters(null)));
    return () => {
      live = false;
    };
    // Runs once, to load my profile and the starting filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!filters) {
    return <Loading label="Loading players" />;
  }

  const header = (
    <View style={styles.filterBar}>
      <Text variant="caption" color="textMuted" style={styles.fill} tabular>
        {filtersSummary(filters)}
      </Text>
      <Button
        variant="quiet"
        size="small"
        label="Filters"
        icon={<Icon ios="line.3.horizontal.decrease" md="filter_list" size="sm" color="accent" />}
        accessibilityHint="Change the distance, level and kind of play"
        onPress={openFilters}
      />
    </View>
  );

  if (search.status === "needsHomePoint") {
    return (
      <View>
        {header}
        <EmptyState
          title="Set where you play"
          body="Love All needs your home area to find players near you."
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
          <Loading label="Loading players" />
        ) : search.status === "error" ? (
          <EmptyState
            title="Couldn't load players"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: search.refresh }}
          />
        ) : (
          <EmptyState
            title={`No players ${radiusLabel(filters.radiusMi).toLowerCase()} yet`}
            body={
              me?.profile?.metro
                ? `Try a wider distance or a different level. ${me.profile.metro.name} is just getting started.`
                : "Try a wider distance or a different level."
            }
            action={{ label: "Widen the search", onPress: openFilters }}
          />
        )
      }
      ListFooterComponent={
        search.loadingMore ? <Loading label="Loading more players" /> : undefined
      }
      onEndReached={search.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={search.refresh}
          tintColor={palette.textMuted}
          colors={[palette.accent]}
        />
      }
    />
  );
}

function FollowedList() {
  const palette = useColors();
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
          <EmptyState
            title="Couldn't load who you follow"
            body="Check your connection and try again."
            action={{ label: "Try again", onPress: () => void load() }}
          />
        ) : follows ? (
          <EmptyState
            title="Nobody followed yet"
            body="Follow players from their profile to find them here later."
          />
        ) : (
          <Loading label="Loading who you follow" />
        )
      }
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void load()}
          tintColor={palette.textMuted}
          colors={[palette.accent]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  switcher: { flexDirection: "row", gap: space[2] },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingBottom: space[1],
  },
  list: { gap: space[2], paddingBottom: size.tabBarClearance },
});
