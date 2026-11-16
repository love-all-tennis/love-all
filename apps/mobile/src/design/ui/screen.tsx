import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { size, space } from "../tokens";
import { useColors } from "../use-tokens";
import { Text } from "./text";

export type ScreenProps = {
  /** The screen's title, in Geist Serif. Leave out when a native header shows it. */
  title?: string;
  /** One line under the title. */
  subtitle?: string;
  children: ReactNode;
  /** Scrolls by default. Pass false for screens that hold their own list. */
  scroll?: boolean;
  /** Safe-area edges to pad. Tabs screens usually skip "bottom". */
  edges?: Edge[];
};

/** The frame for every screen: chalk ground, safe area, 16pt gutters, a title. */
export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  edges = ["top", "left", "right"],
}: ScreenProps) {
  const palette = useColors();
  const header = title ? (
    <View style={styles.header}>
      <Text variant="title">{title}</Text>
      {subtitle && <Text color="textMuted">{subtitle}</Text>}
    </View>
  ) : null;
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: palette.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: size.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: size.gutter,
    paddingTop: space[4],
    paddingBottom: space[8],
    gap: space[6],
  },
  header: { gap: space[1] },
});
