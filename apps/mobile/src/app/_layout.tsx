import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { authClient } from "@/lib/auth-client";

void SplashScreen.preventAutoHideAsync();

/**
 * Which screens exist depends on the session:
 * - signed out: sign-in and sign-up
 * - signed in but not yet confirmed 18+: the confirm-age screen
 * - signed in and confirmed: the app, plus profile setup (the tabs redirect
 *   there until the profile is finished)
 *
 * Expo Router redirects to the first screen that is allowed whenever the
 * session changes, so signing in, confirming and signing out need no manual
 * navigation.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { data: session, isPending } = authClient.useSession();

  // Keep the native splash screen up until the stored session has been read.
  if (isPending) return null;

  const signedIn = session != null;
  const confirmedAdult = session?.user.adultConfirmedAt != null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && confirmedAdult}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
          <Stack.Screen
            name="players/[id]"
            options={{ headerShown: true, title: "", headerBackTitle: "Players" }}
          />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !confirmedAdult}>
          <Stack.Screen name="confirm-age" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}
