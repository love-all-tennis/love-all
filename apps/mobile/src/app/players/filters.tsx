import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Chip, size, space, Text, useColors } from "@/design";
import { setPlayerFilters, usePlayerFilters } from "@/features/players/filter-store";
import {
  defaultFilters,
  PLAY_KINDS,
  RADIUS_OPTIONS_MI,
  setLevelBound,
  togglePlay,
  type PlayerFilters,
} from "@/features/players/filters";
import { NTRP_LEVELS, ntrpLabel } from "@/features/profile/draft";
import { radiusLabel } from "@/lib/distance";

/**
 * The Nearby filters, in a form sheet. Changes stay here until "Show players",
 * so the list doesn't reload on every tap.
 */
export default function PlayerFiltersSheet() {
  const palette = useColors();
  const saved = usePlayerFilters();
  const [filters, setFilters] = useState<PlayerFilters>(saved ?? defaultFilters(null));

  return (
    <ScrollView
      style={{ backgroundColor: palette.surface }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Group label="Distance">
        {RADIUS_OPTIONS_MI.map((miles) => (
          <Chip
            key={miles}
            label={radiusLabel(miles)}
            selected={filters.radiusMi === miles}
            onPress={() => setFilters({ ...filters, radiusMi: miles })}
          />
        ))}
      </Group>

      <Group label="Lowest level">
        {NTRP_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ntrpLabel(level)}
            selected={filters.levelMin === level}
            onPress={() => setFilters(setLevelBound(filters, "min", level))}
          />
        ))}
      </Group>

      <Group label="Highest level">
        {NTRP_LEVELS.map((level) => (
          <Chip
            key={level}
            label={ntrpLabel(level)}
            selected={filters.levelMax === level}
            onPress={() => setFilters(setLevelBound(filters, "max", level))}
          />
        ))}
      </Group>

      <Group label="Open to">
        {PLAY_KINDS.map(({ kind, label }) => (
          <Chip
            key={kind}
            label={label}
            selected={filters.plays === kind}
            onPress={() => setFilters(togglePlay(filters, kind))}
          />
        ))}
      </Group>

      <Button
        label="Show players"
        onPress={() => {
          setPlayerFilters(filters);
          router.back();
        }}
      />
    </ScrollView>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="heading" accessibilityRole="header">
        {label}
      </Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    maxWidth: size.maxContentWidth,
    alignSelf: "center",
    padding: size.gutter,
    paddingBottom: space[10],
    gap: space[6],
  },
  group: { gap: space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
