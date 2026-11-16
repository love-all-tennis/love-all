import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { ntrpLabel, type Ntrp } from "../profile/draft";
import { distanceLabel, playsLabel } from "./filters";

/** A round photo, or the player's initials when they have none. */
export function PlayerAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  const theme = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={shape} accessibilityIgnoresInvertColors />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <View style={[shape, styles.initials, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" style={{ fontSize: size * 0.36, lineHeight: size * 0.5 }}>
        {initials || "?"}
      </ThemedText>
    </View>
  );
}

type RowPlayer = {
  readonly id: string;
  readonly displayName: string;
  readonly photoUrl: string | null;
  readonly ntrp: Ntrp | null;
  readonly playsSingles: boolean;
  readonly playsDoubles: boolean;
  readonly playsHitting: boolean;
  readonly distanceKm: number | null;
};

/** One player in a list: photo, name, level, distance and what they play. */
export function PlayerRow({ player, onPress }: { player: RowPlayer; onPress: () => void }) {
  const theme = useTheme();
  const level = player.ntrp ? `NTRP ${ntrpLabel(player.ntrp)}` : "No rating yet";
  const distance = distanceLabel(player.distanceKm);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens their profile"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}
    >
      <PlayerAvatar name={player.displayName} photoUrl={player.photoUrl} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {player.displayName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {distance ? `${level} · ${distance}` : level}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {playsLabel(player)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  initials: {
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
