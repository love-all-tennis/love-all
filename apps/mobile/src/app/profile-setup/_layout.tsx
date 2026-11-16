import { Stack } from "expo-router";

import { typography, useColors } from "@/design";
import { ProfileDraftProvider } from "@/features/profile/draft-context";

/** Profile setup: four short screens that share one form. */
export default function ProfileSetupLayout() {
  const palette = useColors();
  return (
    <ProfileDraftProvider>
      <Stack
        screenOptions={{
          headerTitle: "Your profile",
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.accent,
          headerTitleStyle: {
            fontFamily: typography.subheading.fontFamily,
            fontSize: typography.subheading.fontSize,
            color: palette.text,
          },
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerBackVisible: false }} />
      </Stack>
    </ProfileDraftProvider>
  );
}
