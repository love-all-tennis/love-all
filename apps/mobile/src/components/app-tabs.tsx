import { NativeTabs } from "expo-router/native-tabs";

import { typography, useColors } from "@/design";

/**
 * The native tab bar: iOS and Android draw their own. Icons are SF Symbols on
 * iOS (outline, filled when selected) and Material symbols on Android, per
 * the Tab bar section of docs/design.md. Forum and Messages join as their
 * features land.
 */
export default function AppTabs() {
  const palette = useColors();
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
    </NativeTabs>
  );
}
