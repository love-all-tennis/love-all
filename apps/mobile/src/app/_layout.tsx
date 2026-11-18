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

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const signedIn = session != null;
  const confirmedAdult = session?.user.adultConfirmedAt != null;
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
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
          <Stack.Screen name="forum/category/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="forum/thread/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="forum/new" options={{ ...header, title: "New thread" }} />
          <Stack.Screen name="forum/report" options={{ ...sheet, title: "Report" }} />
          <Stack.Protected guard={session?.user.role === "admin"}>
            <Stack.Screen name="moderation" options={{ ...header, title: "Moderation" }} />
          </Stack.Protected>
          <Stack.Screen name="messages/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="messages/report" options={{ ...sheet, title: "Report" }} />
          <Stack.Screen name="gear/index" options={{ ...header, title: "Gear reviews" }} />
          <Stack.Screen name="gear/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="gear/new" options={{ ...header, title: "Add gear" }} />
          <Stack.Screen name="gear/review" options={{ ...header, title: "Write a review" }} />
          <Stack.Screen name="gear/report" options={{ ...sheet, title: "Report" }} />
          <Stack.Screen name="clubs/index" options={{ ...header, title: "Club reviews" }} />
          <Stack.Screen name="clubs/[id]" options={{ ...header, title: "" }} />
          <Stack.Screen name="clubs/new" options={{ ...header, title: "Add a club" }} />
          <Stack.Screen name="clubs/review" options={{ ...sheet, title: "Write a review" }} />
          <Stack.Screen name="clubs/report" options={{ ...sheet, title: "Report" }} />
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
