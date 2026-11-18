import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { size as sizes } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

export type AvatarSize = keyof typeof sizes.avatar;

/** The initials for a name: "Sam Lee" is "SL". */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** A round player photo, or their initials on `surfaceSunken` when they have none. */
export function Avatar({
  name,
  photoUrl,
  size = "md",
}: {
  name: string;
  photoUrl: string | null;
  /** `sm` in dense lists, `md` in rows, `lg` or `xl` on a profile. */
  size?: AvatarSize;
}) {
  const palette = useColors();
  const side = sizes.avatar[size];
  const shape = { width: side, height: side, borderRadius: side / 2 };
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[shape, { backgroundColor: palette.surfaceSunken }]}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={[shape, styles.initials, { backgroundColor: palette.surfaceSunken }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        variant={size === "sm" ? "label" : size === "md" ? "subheading" : "title"}
        color="textMuted"
      >
        {initialsOf(name) || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
