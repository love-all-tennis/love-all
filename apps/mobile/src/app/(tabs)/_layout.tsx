import { Redirect } from "expo-router";

import AppTabs from "@/components/app-tabs";
import { useNeedsProfileSetup } from "@/features/profile/use-needs-profile-setup";

export default function TabLayout() {
  // A signed-in player without a finished profile goes through setup first.
  if (useNeedsProfileSetup()) return <Redirect href="/profile-setup" />;
  return <AppTabs />;
}
