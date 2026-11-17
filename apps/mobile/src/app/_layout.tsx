import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type NativeStackNavigationOptions,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { typography, useAppFonts, useColors } from "@/design";
import { useColorScheme } from "@/hooks/use-color-scheme";
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
  const scheme = useColorScheme();
  const palette = useColors();
  const { data: session, isPending } = authClient.useSession();
  const fontsReady = useAppFonts();
  const ready = !isPending && fontsReady;

  // Keep the native splash screen up until the stored session and the fonts are ready.
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = session != null;
  const confirmedAdult = session?.user.adultConfirmedAt != null;
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  // Native headers, sheets and the navigation container take the app's palette.
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };
  const header: NativeStackNavigationOptions = {
    headerShown: true,
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    headerStyle: { backgroundColor: palette.background },
    headerTintColor: palette.accent,
    headerTitleStyle: {
      fontFamily: typography.subheading.fontFamily,
      fontSize: typography.subheading.fontSize,
      color: palette.text,
    },
  };
  const sheet: NativeStackNavigationOptions = {
    ...header,
    presentation: "formSheet",
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.75, 1],
    headerStyle: { backgroundColor: palette.surface },
    contentStyle: { backgroundColor: palette.surface },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && confirmedAdult}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile-setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="players/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="players/filters" options={{ ...sheet, title: "Filters" }} />
          <Stack.Screen name="players/report" options={{ ...sheet, title: "Report" }} />
          <Stack.Screen name="sessions/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="sessions/new" options={{ ...header, title: "New session" }} />
          <Stack.Screen name="sessions/edit" options={{ ...header, title: "Edit session" }} />
          <Stack.Screen name="sessions/invite" options={{ ...sheet, title: "Invite players" }} />
          <Stack.Screen name="sessions/invite-to" options={{ ...sheet, title: "Invite to play" }} />
          <Stack.Screen name="sessions/score" options={{ ...sheet, title: "Record score" }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !confirmedAdult}>
          <Stack.Screen name="confirm-age" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
