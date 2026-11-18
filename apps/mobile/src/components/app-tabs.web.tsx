import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from "expo-router/ui";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";

import { Icon, motion, radius, size, space, Text, useColors, type IconProps } from "@/design";
import { unreadBadge } from "@/features/messages/messages";
import { useUnreadBadgeSync } from "@/features/messages/use-inbox";
import { useUnreadConversations } from "@/features/messages/unread-store";

const TABS: ReadonlyArray<{
  name: string;
  href: "/" | "/players" | "/play" | "/forum" | "/messages";
  label: string;
  icon: Pick<IconProps, "ios" | "md">;
}> = [
  { name: "index", href: "/", label: "Home", icon: { ios: "house", md: "home" } },
  { name: "players", href: "/players", label: "Players", icon: { ios: "person.2", md: "group" } },
  { name: "play", href: "/play", label: "Play", icon: { ios: "calendar", md: "calendar_month" } },
  {
    name: "forum",
    href: "/forum",
    label: "Forum",
    icon: { ios: "bubble.left.and.bubble.right", md: "forum" },
  },
  { name: "messages", href: "/messages", label: "Messages", icon: { ios: "envelope", md: "mail" } },
];

/** The web tab bar: a bottom bar on `surface`, matching the native tabs. */
export default function AppTabs() {
  const palette = useColors();
  useUnreadBadgeSync();
  const badge = unreadBadge(useUnreadConversations());

  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList
        style={[styles.bar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}
      >
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton
              label={tab.label}
              icon={tab.icon}
              badge={tab.name === "messages" ? badge : null}
            />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({
  label,
  icon,
  badge,
  isFocused,
  ...props
}: TabTriggerSlotProps & {
  label: string;
  icon: Pick<IconProps, "ios" | "md">;
  badge: string | null;
}) {
  const palette = useColors();
  const color = isFocused ? "accent" : "textMuted";

  return (
    <Pressable
      // WARNING: expo-router passes the tab trigger's Pressable props through untyped.
      {...(props as PressableProps)}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      style={({ pressed }) => [styles.tab, pressed && { opacity: motion.pressOpacity }]}
    >
      <View
        style={[styles.pill, isFocused && { backgroundColor: palette.accentSoft }]}
        accessibilityElementsHidden
      >
        <Icon {...icon} color={isFocused ? "onAccentSoft" : "textMuted"} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: palette.danger }]}>
            <Text variant="label" color="onDanger" tabular>
              {badge}
            </Text>
          </View>
        ) : null}
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
    maxWidth: size.maxContentWidth / TABS.length,
    minHeight: size.minTap,
    alignItems: "center",
    gap: space[1],
  },
  badge: {
    position: "absolute",
    top: -space[1],
    right: space[1],
    minWidth: size.icon.md,
    paddingHorizontal: space[1],
    borderRadius: radius.full,
    alignItems: "center",
  },
  pill: {
    paddingHorizontal: space[4],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
});
