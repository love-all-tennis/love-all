import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, ErrorBanner, Loading, Screen, space } from "@/design";
import {
  confirmAdult,
  confirmedAdultOnSignUp,
  rememberAdultConfirmation,
} from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";
import { signOut } from "@/lib/sign-out";

const onSignOut = () => void signOut();

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
    if (!autoConfirming) {
      return;
    }
    rememberAdultConfirmation(false);
    void confirm();
    // Runs once, with the answer given on the sign-up screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (autoConfirming && submitting && !error) {
    return (
      <Screen title="Setting up your account">
        <Loading label="Setting up your account" />
      </Screen>
    );
  }

  if (underage) {
    return (
      <Screen
        title="Love All is for players 18 and older"
        subtitle="You need to be 18 or older to use Love All. Thanks for checking it out."
      >
        <Button label="Sign out" variant="secondary" onPress={onSignOut} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Confirm your age"
      subtitle="Love All is for adult players only. Confirm you're 18 or older to carry on."
    >
      <View style={styles.group}>
        <ErrorBanner>{error}</ErrorBanner>
        <Button label="I'm 18 or older" onPress={() => void confirm()} loading={submitting} />
        <Button
          label="I'm under 18"
          variant="secondary"
          disabled={submitting}
          onPress={() => setUnderage(true)}
        />
      </View>
      <View style={styles.center}>
        <Button variant="quiet" size="small" label="Sign out" onPress={onSignOut} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  center: { flexDirection: "row", justifyContent: "center" },
});
