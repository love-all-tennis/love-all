import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";

import { Icon, motion, radius, size, space, Text, useColors, type IconProps } from "@/design";

const TABS: ReadonlyArray<{
  name: string;
  href: "/" | "/players";
  label: string;
  icon: Pick<IconProps, "ios" | "md">;
}> = [
  { name: "index", href: "/", label: "Home", icon: { ios: "house", md: "home" } },
  { name: "players", href: "/players", label: "Players", icon: { ios: "person.2", md: "group" } },
];

/** The web tab bar: a bottom bar on `surface`, matching the native tabs. */
export default function AppTabs() {
  const palette = useColors();
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList
        style={[styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}
      >
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton label={tab.label} icon={tab.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({
  label,
  icon,
  isFocused,
  ...props
}: TabTriggerSlotProps & { label: string; icon: Pick<IconProps, "ios" | "md"> }) {
  const palette = useColors();
  const color = isFocused ? "accent" : "textMuted";
  return (
    <Pressable
      {...(props as PressableProps)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tab, pressed && { opacity: motion.pressOpacity }]}
    >
      <View
        style={[styles.pill, isFocused && { backgroundColor: palette.accentSoft }]}
        accessibilityElementsHidden
      >
        <Icon {...icon} color={isFocused ? "onAccentSoft" : "textMuted"} />
      </View>
      <Text variant="label" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1 },
  bar: {
    flexDirection: "row",
    justifyContent: "center",
    borderTopWidth: size.hairline,
    paddingVertical: space[2],
  },
  tab: {
    flex: 1,
    maxWidth: size.maxContentWidth / 4,
    minHeight: size.minTap,
    alignItems: "center",
    gap: space[1],
  },
  pill: {
    paddingHorizontal: space[4],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
});
