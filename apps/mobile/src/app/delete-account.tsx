import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, ErrorBanner, Loading, Screen, space, Text, TextField } from "@/design";
import { confirmDelete } from "@/features/account/confirm-delete";
import {
  deletionCheck,
  deletionProblem,
  providerName,
  type DeletionCheck,
} from "@/features/account/deletion";
import { authClient } from "@/lib/auth-client";
import { forgetPushToken } from "@/lib/push";

const gone = [
  "Your profile, level, availability and photo",
  "Follows and blocks",
  "Your spot in upcoming sessions. Upcoming sessions you host are cancelled and the players are told",
  "Your session comments and forum reactions",
  "Your conversations and messages",
  "Your club and gear reviews",
];

const kept = [
  "Your forum threads and replies, and sessions you played, stay for the other players, shown as from a deleted account.",
  "Clubs and gear you added stay listed, without your name.",
  "Reports stay with the moderators, shown as from a deleted account.",
];

/**
 * Deletes the player's account for good. Email players confirm with their
 * password; Apple and Google players sign in again if their session is more
 * than a day old. Once it's gone the session ends and the app goes back to
 * sign-in.
 */
export default function DeleteAccountScreen() {
  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    authClient
      .listAccounts()
      .then(({ data }) => {
        if (live) setCheck(deletionCheck((data ?? []).map((a) => a.providerId)));
      })
      .catch(() => {
        if (live) setCheck({ kind: "password" });
      });

    return () => {
      live = false;
    };
  }, []);

  if (!check) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading your account" />
      </Screen>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError(null);
    setPasswordError(null);

    try {
      const result = await authClient.deleteUser(check.kind === "password" ? { password } : {});

      if (result.error) {
        const problem = deletionProblem(result.error.code);

        if (problem.kind === "password") setPasswordError(problem.message);
        else if (problem.kind === "sign-in") setNeedsSignIn(true);
        else setError(problem.message);
        setBusy(false);

        return;
      }

      await forgetPushToken();
      await authClient.signOut();
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
      setBusy(false);
    }
  };

  const signInAgain = async (provider: "apple" | "google") => {
    setBusy(true);
    setError(null);

    try {
      const result = await authClient.signIn.social({ provider, callbackURL: "/delete-account" });

      if (result.error) {
        setError(result.error.message ?? "That sign-in didn't work. Try again.");
        setBusy(false);

        return;
      }

      setNeedsSignIn(false);
      await remove();
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (check.kind === "password" && !password) {
      setPasswordError("Enter your password to delete your account.");

      return;
    }

    confirmDelete(() => void remove());
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Text>
        Deleting your account removes you from Love All for good. It can't be undone, and other
        players won't be able to find you or message you.
      </Text>

      <Card>
        <Text variant="subheading">What's deleted</Text>
        <View style={styles.list}>
          {gone.map((line) => (
            <Text key={line} color="textMuted">
              {`• ${line}`}
            </Text>
          ))}
        </View>
      </Card>

      <Card tone="sunken">
        <Text variant="subheading">What stays</Text>
        <View style={styles.list}>
          {kept.map((line) => (
            <Text key={line} color="textMuted">
              {line}
            </Text>
          ))}
        </View>
      </Card>

      <View style={styles.group}>
        {check.kind === "password" ? (
          <TextField
            label="Password"
            hint="Enter your password to confirm it's you."
            value={password}
            onChangeText={setPassword}
            error={passwordError ?? undefined}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={onDelete}
          />
        ) : null}

        {check.kind === "sign-in" && needsSignIn ? (
          <>
            <Text color="textMuted">
              {`To keep your account safe, sign in with ${providerName(check.provider)} again to confirm it's you.`}
            </Text>
            <Button
              variant="danger"
              label="Sign in and delete"
              loading={busy}
              onPress={() => confirmDelete(() => void signInAgain(check.provider))}
            />
          </>
        ) : (
          <Button variant="danger" label="Delete account" loading={busy} onPress={onDelete} />
        )}
        <ErrorBanner>{error}</ErrorBanner>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[1], paddingTop: space[2] },
  group: { gap: space[4] },
});
