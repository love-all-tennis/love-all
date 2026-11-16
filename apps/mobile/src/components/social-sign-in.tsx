import { useState } from "react";
import { View, StyleSheet } from "react-native";

import { Button, ErrorText } from "@/components/auth-ui";
import { Spacing } from "@/constants/theme";
import { authClient, type SocialProvider } from "@/lib/auth-client";

const providers: ReadonlyArray<{ id: SocialProvider; title: string }> = [
  { id: "apple", title: "Continue with Apple" },
  { id: "google", title: "Continue with Google" },
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
  /** Runs right before the browser opens, for example to remember the 18+ answer. */
  onBeforeSignIn?: () => void;
}) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: SocialProvider) => {
    setBusy(provider);
    setError(null);
    onBeforeSignIn?.();
    try {
      // A relative callback is turned into a loveall:// deep link by the Expo plugin.
      const result = await authClient.signIn.social({ provider, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message ?? "That sign-in didn't work. Please try again.");
      }
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.list}>
      {providers.map(({ id, title }) => (
        <Button
          key={id}
          variant="secondary"
          title={title}
          disabled={disabled || (busy != null && busy !== id)}
          loading={busy === id}
          onPress={() => void signIn(id)}
        />
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
});
