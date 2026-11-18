import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, ErrorBanner, space } from "@/design";
import { authClient, type SocialProvider } from "@/lib/auth-client";

const providers: ReadonlyArray<{ id: SocialProvider; label: string }> = [
  { id: "apple", label: "Continue with Apple" },
  { id: "google", label: "Continue with Google" },
];

/**
 * Google and Sign in with Apple. Better Auth's Expo plugin opens the provider
 * in an in-app browser session and the API redirects back into the app via the
 * `loveall://` scheme, where the plugin stores the new session cookie.
 */
export function SocialSignIn({
  disabled = false,
  onBeforeSignIn,
}: {
  disabled?: boolean;
  /**
   * Runs right before the browser opens, for example to remember the 18+
   * answer. Return false to stop, such as when the 18+ box isn't ticked.
   */
  onBeforeSignIn?: () => boolean | void;
}) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: SocialProvider) => {
    if (onBeforeSignIn?.() === false) return;
    setBusy(provider);
    setError(null);
    try {
      // A relative callback is turned into a loveall:// deep link by the Expo plugin.
      const result = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message ?? "That sign-in didn't work. Try again.");
      }
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.list}>
      {providers.map(({ id, label }) => (
        <Button
          key={id}
          variant="secondary"
          label={label}
          disabled={disabled || (busy != null && busy !== id)}
          loading={busy === id}
          onPress={() => void signIn(id)}
        />
      ))}
      <ErrorBanner>{error}</ErrorBanner>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[2] },
});
