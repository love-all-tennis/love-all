import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthScreen, Button, ErrorText } from "@/components/auth-ui";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import {
  confirmAdult,
  confirmedAdultOnSignUp,
  rememberAdultConfirmation,
} from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";

/**
 * Shown to a signed-in player who hasn't confirmed they're 18 or older yet:
 * right after email sign-up (where the answer from the form is sent
 * automatically) and after a first Google or Apple sign-in.
 */
export default function ConfirmAgeScreen() {
  const { refetch } = authClient.useSession();
  const [autoConfirming] = useState(confirmedAdultOnSignUp);
  const [submitting, setSubmitting] = useState(autoConfirming);
  const [underage, setUnderage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await confirmAdult();
      // The root layout opens the app once the session shows the confirmation.
      await refetch({ query: { disableCookieCache: true } });
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!autoConfirming) return;
    rememberAdultConfirmation(false);
    void confirm();
    // Runs once, with the answer given on the sign-up screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (autoConfirming && submitting && !error) {
    return (
      <AuthScreen title="Setting up your account">
        <View style={{ paddingVertical: Spacing.four }}>
          <ActivityIndicator />
        </View>
      </AuthScreen>
    );
  }

  if (underage) {
    return (
      <AuthScreen
        title="Love All is for players 18 and older"
        subtitle="Sorry, you need to be 18 or older to use Love All."
      >
        <Button title="Sign out" variant="secondary" onPress={() => void authClient.signOut()} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="One more thing"
      subtitle="Love All is for adult players only. Please confirm you're 18 or older."
    >
      <ErrorText>{error}</ErrorText>
      <Button title="I'm 18 or older" onPress={() => void confirm()} loading={submitting} />
      <Button
        title="I'm under 18"
        variant="secondary"
        disabled={submitting}
        onPress={() => setUnderage(true)}
      />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: "center" }}>
        Not you?{" "}
        <ThemedText
          type="smallBold"
          themeColor="accent"
          accessibilityRole="button"
          onPress={() => void authClient.signOut()}
        >
          Sign out
        </ThemedText>
      </ThemedText>
    </AuthScreen>
  );
}
