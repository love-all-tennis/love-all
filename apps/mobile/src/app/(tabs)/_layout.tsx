import { Redirect } from "expo-router";
import { Platform } from "react-native";

import AppTabs from "@/components/app-tabs";
import { usePushNotifications } from "@/features/notifications/use-push-notifications";
import { useNeedsProfileSetup } from "@/features/profile/use-needs-profile-setup";

export default function TabLayout() {
  // A signed-in player without a finished profile goes through setup first.
  if (useNeedsProfileSetup()) return <Redirect href="/profile-setup" />;
  return (
    <>
      {Platform.OS !== "web" && <PushNotifications />}
      <AppTabs />
    </>
  );
}

/** Asks for notifications once setup is done, and follows taps on them. */
function PushNotifications() {
  usePushNotifications();
  return null;
}
