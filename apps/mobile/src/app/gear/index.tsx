import type { EquipmentKind } from "@love-all/domain";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import {
  Button,
  Chip,
  EmptyState,
  Icon,
  Loading,
  Screen,
  space,
  TextField,
  useColors,
} from "@/design";
import { ItemCard } from "@/features/gear/components";
import { KIND_LABELS, KINDS } from "@/features/gear/gear";
import { useCatalog } from "@/features/gear/use-gear";

const openItem = (id: string) => router.push({ pathname: "/gear/[id]", params: { id } });

/** The gear catalog: search, filter by kind, open an item, or add a missing one. */
export default function GearScreen() {
  const palette = useColors();
  const [kind, setKind] = useState<EquipmentKind | null>(null);
  const [q, setQ] = useState("");
  const catalog = useCatalog(kind, q);
  const filtered = kind !== null || q.trim() !== "";
  const addItem = () =>
    router.push({
      pathname: "/gear/new",
      params: { ...(kind ? { kind } : {}), ...(q.trim() ? { model: q.trim() } : {}) },
    });

  return (
    <Screen scroll={false} edges={["left", "right", "bottom"]}>
      <FlatList
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        data={catalog.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ItemCard item={item} onPress={() => openItem(item.id)} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextField
              label="Search"
              placeholder="Brand or model"
              value={q}
              onChangeText={setQ}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip label="All" selected={kind === null} onPress={() => setKind(null)} />
              {KINDS.map((k) => (
                <Chip
                  key={k}
                  label={KIND_LABELS[k]}
                  selected={kind === k}
                  onPress={() => setKind(kind === k ? null : k)}
                />
              ))}
            </ScrollView>
            <Button
              variant="quiet"
              size="small"
              label="Add gear"
              icon={<Icon ios="plus" md="add" size="sm" color="accent" />}
              onPress={addItem}
            />
          </View>
        }
        ListEmptyComponent={
          catalog.status === "loading" ? (
            <Loading label="Loading gear" />
          ) : catalog.status === "error" ? (
            <EmptyState
              title="Couldn't load gear"
              body="Check your connection and try again."
              action={{ label: "Try again", onPress: catalog.refresh }}
            />
          ) : filtered ? (
            <EmptyState
              title="Nothing matches"
              body="Check the spelling, or add it so others can review it too."
              action={{ label: "Add gear", onPress: addItem }}
            />
          ) : (
            <EmptyState
              title="No gear yet"
              body="Add the racket, strings or shoes you play with, then rate them."
              action={{ label: "Add gear", onPress: addItem }}
            />
          )
        }
        ListFooterComponent={
          catalog.loadingMore ? <Loading label="Loading more gear" /> : undefined
        }
        onEndReached={catalog.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={catalog.refresh}
            tintColor={palette.textMuted}
            colors={[palette.accent]}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[2], paddingBottom: space[8] },
  header: { gap: space[3], paddingBottom: space[2] },
  chips: { gap: space[2], paddingVertical: space[1] },
});
