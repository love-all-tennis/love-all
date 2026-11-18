import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Divider, ErrorBanner, Screen, space, Text, TextField } from "@/design";
import { SocialSignIn } from "@/features/auth/social-sign-in";
import { rememberAdultConfirmation } from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";

type FieldErrors = { email?: string; password?: string };

const check = (email: string, password: string) =>
  ({
    ...(email.trim() ? {} : { email: "Enter the email you signed up with" }),
    ...(password ? {} : { password: "Enter your password" }),
  }) satisfies FieldErrors;

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldErrors = tried ? check(email, password) : {};

  const submit = async () => {
    setTried(true);
    if (Object.keys(check(email, password)).length > 0) return;
    setSubmitting(true);
    setError(null);
    rememberAdultConfirmation(false);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(
          result.error.status === 401
            ? "That email and password don't match an account. Check them and try again."
            : (result.error.message ?? "Couldn't sign in. Try again."),
        );
      }
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title="Sign in" subtitle="Find players at your level and set up a hit.">
      <View style={styles.group}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <ErrorBanner>{error}</ErrorBanner>
        <Button label="Sign in" onPress={() => void submit()} loading={submitting} />
      </View>

      <Divider label="or" />
      <SocialSignIn disabled={submitting} onBeforeSignIn={() => rememberAdultConfirmation(false)} />

      <View style={styles.switch}>
        <Text variant="caption" color="textMuted">
          New to Love All?
        </Text>
        <Button
          variant="quiet"
          size="small"
          label="Create an account"
          onPress={() => router.replace("/sign-up")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[4] },
  switch: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1] },
});
