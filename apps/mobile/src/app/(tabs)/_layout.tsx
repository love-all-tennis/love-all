import { Redirect } from "expo-router";
import { Platform } from "react-native";

import AppTabs from "@/components/app-tabs";
import { usePushNotifications } from "@/features/notifications/use-push-notifications";
import { useNeedsProfileSetup } from "@/features/profile/use-needs-profile-setup";

export default function TabLayout() {
  if (useNeedsProfileSetup()) return <Redirect href="/profile-setup" />;
  return (
    <>
      {Platform.OS !== "web" && <PushNotifications />}
      <AppTabs />
    </>
  );
}

function PushNotifications() {
  usePushNotifications();
  return null;
}
