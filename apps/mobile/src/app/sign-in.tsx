import { Link } from "expo-router";
import { useState } from "react";

import { AuthScreen, Button, Divider, ErrorText, TextField } from "@/components/auth-ui";
import { SocialSignIn } from "@/components/social-sign-in";
import { ThemedText } from "@/components/themed-text";
import { rememberAdultConfirmation } from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    // Only the sign-up screen asks the age question; anyone new who signs in
    // here is asked on the confirm-age screen.
    rememberAdultConfirmation(false);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(
          result.error.status === 401
            ? "That email and password don't match an account."
            : (result.error.message ?? "Couldn't sign in. Please try again."),
        );
      }
      // On success the session changes and the root layout opens the app.
    } catch {
      setError("Couldn't reach Love All. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen title="Welcome back" subtitle="Sign in to find players and set up a hit.">
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => canSubmit && void submit()}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Sign in"
        onPress={() => void submit()}
        disabled={!canSubmit}
        loading={submitting}
      />
      <Divider label="or" />
      <SocialSignIn disabled={submitting} onBeforeSignIn={() => rememberAdultConfirmation(false)} />
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: "center" }}>
        New to Love All?{" "}
        <Link href="/sign-up" replace>
          <ThemedText type="smallBold" themeColor="accent">
            Create an account
          </ThemedText>
        </Link>
      </ThemedText>
    </AuthScreen>
  );
}
