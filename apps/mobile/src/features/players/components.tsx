import { StyleSheet, View } from "react-native";

import { Avatar, Card, space, Text } from "@/design";
import { distanceLabel } from "@/lib/distance";
import { ntrpLabel, type Ntrp } from "../profile/draft";
import { playsLabel } from "./filters";

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

export const levelLabel = (ntrp: Ntrp | null) =>
  ntrp ? `NTRP ${ntrpLabel(ntrp)}` : "No rating yet";

/** One player in a list: photo, name, level, distance and what they play. */
export function PlayerRow({ player, onPress }: { player: RowPlayer; onPress: () => void }) {
  const level = levelLabel(player.ntrp);
  const distance = distanceLabel(player.distanceKm);
  const meta = distance ? `${level} · ${distance}` : level;
  const plays = playsLabel(player);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${player.displayName}, ${meta}, plays ${plays}`}
      accessibilityHint="Opens their profile"
      style={styles.row}
    >
      <Avatar name={player.displayName} photoUrl={player.photoUrl} />
      <View style={styles.text}>
        <Text variant="subheading" numberOfLines={1}>
          {player.displayName}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1} tabular>
          {meta}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {plays}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  text: { flex: 1 },
});
