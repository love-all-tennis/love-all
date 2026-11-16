import { Stack } from "expo-router";

import { ProfileDraftProvider } from "@/features/profile/draft-context";

/** Profile setup: four short screens that share one form. */
export default function ProfileSetupLayout() {
  return (
    <ProfileDraftProvider>
      <Stack
        screenOptions={{ headerTitle: "Your profile", headerBackButtonDisplayMode: "minimal" }}
      >
        <Stack.Screen name="index" options={{ headerBackVisible: false }} />
      </Stack>
    </ProfileDraftProvider>
  );
}
