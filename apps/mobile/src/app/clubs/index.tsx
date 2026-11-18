import { CLUBS_RADIUS_DEFAULT_KM, type ClubSummary } from "@love-all/domain";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Button, EmptyState, Loading, Screen, space, TextField, useColors } from "@/design";
import { ClubCard } from "@/features/clubs/components";
import { fetchClubs } from "@/features/clubs/clubs-api";
import { kmToMiles, radiusLabel } from "@/lib/distance";

type State =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "needsHome" }
  | { readonly status: "ready"; readonly clubs: ReadonlyArray<ClubSummary> };

const openClub = (id: string) => router.push({ pathname: "/clubs/[id]", params: { id } });
const addClub = () => router.push("/clubs/new");

/** How long to wait after typing before searching. */
const SEARCH_DELAY_MS = 300;

const radius = radiusLabel(Math.round(kmToMiles(CLUBS_RADIUS_DEFAULT_KM)));

/** Clubs near my home area, nearest first, with their stars. Searchable by name or address. */
export default function ClubsScreen() {
  const palette = useColors();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(() => {
    const mine = ++generation.current;
    return fetchClubs(search)
      .then((result) => {
        if (mine !== generation.current) {
          return;
        }
        setState("needsHome" in result ? { status: "needsHome" } : { status: "ready", ...result });
      })
      .catch(() => {
        if (mine !== generation.current) {
          return;
        }
        // Keep what's up; only show the error when there's nothing to show.
        setState((s) => (s.status === "ready" ? s : { status: "error" }));
      });
  }, [search]);

  // Reloads on focus too, so stars change after I review a club.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const retry = () => {
    setState({ status: "loading" });
    void load();
  };

  if (state.status === "needsHome") {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <EmptyState
          title="Set your home area"
          body="Clubs are listed by how far they are from your home area."
          action={{ label: "Set home area", onPress: () => router.push("/profile-setup/home") }}
        />
      </Screen>
    );
  }

  const clubs = state.status === "ready" ? state.clubs : [];

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        data={clubs}
        keyExtractor={(club) => club.id}
        renderItem={({ item }) => <ClubCard club={item} onPress={() => openClub(item.id)} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.textMuted}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <TextField
              label="Search clubs"
              hint={`Clubs ${radius.toLowerCase()} of your home area, nearest first.`}
              value={query}
              onChangeText={setQuery}
              placeholder="Name or address"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {clubs.length > 0 ? <Button label="Add a club" onPress={addClub} /> : null}
          </View>
        }
        ListEmptyComponent={
          state.status === "loading" ? (
            <Loading label="Loading clubs" />
          ) : state.status === "error" ? (
            <EmptyState
              title="Couldn't load clubs"
              body="Check your connection and try again."
              action={{ label: "Try again", onPress: retry }}
            />
          ) : search ? (
            <EmptyState
              title={`No clubs match "${search}"`}
              body="Check the spelling, or add the club if it isn't listed yet."
              action={{ label: "Add a club", onPress: addClub }}
            />
          ) : (
            <EmptyState
              title="No clubs near you yet"
              body="Add the courts you play at so other players can find and review them."
              action={{ label: "Add a club", onPress: addClub }}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[3], paddingBottom: space[8] },
  header: { gap: space[3], paddingBottom: space[1] },
});
