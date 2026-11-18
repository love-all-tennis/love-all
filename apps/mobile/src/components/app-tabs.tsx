import { NativeTabs } from "expo-router/native-tabs";

import { typography, useColors } from "@/design";
import { unreadBadge } from "@/features/messages/messages";
import { useUnreadBadgeSync } from "@/features/messages/use-inbox";
import { useUnreadConversations } from "@/features/messages/unread-store";

/**
 * The native tab bar: iOS and Android draw their own. Icons are SF Symbols on
 * iOS (outline, filled when selected) and Material symbols on Android, per
 * the Tab bar section of docs/design.md. Messages carries a badge with the
 * number of conversations that have unread messages.
 */
export default function AppTabs() {
  const palette = useColors();
  useUnreadBadgeSync();
  const badge = unreadBadge(useUnreadConversations());

  return (
    <NativeTabs
      backgroundColor={palette.surface}
      iconColor={{ default: palette.textMuted, selected: palette.accent }}
      tintColor={palette.accent}
      indicatorColor={palette.accentSoft}
      rippleColor={palette.surfacePressed}
      labelStyle={{
        default: { color: palette.textMuted, fontFamily: typography.label.fontFamily },
        selected: { color: palette.accent, fontFamily: typography.label.fontFamily },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="players">
        <NativeTabs.Trigger.Label>Players</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.2", selected: "person.2.fill" }}
          md="group"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="play">
        <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar", selected: "calendar" }}
          md="calendar_month"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="forum">
        <NativeTabs.Trigger.Label>Forum</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
          md="forum"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="messages">
        <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "envelope", selected: "envelope.fill" }}
          md="mail"
        />
        <NativeTabs.Trigger.Badge hidden={badge === null}>
          {badge ?? undefined}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
