import { Link } from "expo-router";
import { useState } from "react";

import { AuthScreen, Button, Checkbox, Divider, ErrorText, TextField } from "@/components/auth-ui";
import { SocialSignIn } from "@/components/social-sign-in";
import { ThemedText } from "@/components/themed-text";
import { rememberAdultConfirmation } from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";

/** Better Auth's default minimum. */
const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    isAdult &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    // Sent from the confirm-age screen once the new session exists.
    rememberAdultConfirmation(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (result.error) {
        rememberAdultConfirmation(false);
        setError(
          result.error.code === "USER_ALREADY_EXISTS" ||
            result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "There's already an account with that email. Try signing in."
            : (result.error.message ?? "Couldn't create your account. Please try again."),
        );
      }
    } catch {
      rememberAdultConfirmation(false);
      setError("Couldn't reach Love All. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      title="Join Love All"
      subtitle="Find players at your level around Detroit and set up matches and hitting sessions."
    >
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        placeholder="What other players will call you"
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      {passwordTooShort && (
        <ThemedText type="small" themeColor="textSecondary">
          Use at least {MIN_PASSWORD_LENGTH} characters.
        </ThemedText>
      )}
      <Checkbox
        checked={isAdult}
        onChange={setIsAdult}
        label="I confirm I'm 18 or older. Love All is for adult players only."
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Create account"
        onPress={() => void submit()}
        disabled={!canSubmit}
        loading={submitting}
      />
      <Divider label="or" />
      <SocialSignIn
        disabled={!isAdult || submitting}
        onBeforeSignIn={() => rememberAdultConfirmation(true)}
      />
      {!isAdult && (
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: "center" }}>
          Confirm you're 18 or older to continue.
        </ThemedText>
      )}
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/sign-in" replace>
          <ThemedText type="smallBold" themeColor="accent">
            Sign in
          </ThemedText>
        </Link>
      </ThemedText>
    </AuthScreen>
  );
}
