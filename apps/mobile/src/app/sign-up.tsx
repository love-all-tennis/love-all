import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Divider, ErrorBanner, Screen, space, Text, TextField } from "@/design";
import { Checkbox } from "@/features/auth/components";
import { SocialSignIn } from "@/features/auth/social-sign-in";
import { rememberAdultConfirmation } from "@/lib/adult-confirmation";
import { authClient } from "@/lib/auth-client";

/** Better Auth's default minimum. */
const MIN_PASSWORD_LENGTH = 8;

const ADULT_ERROR = "Confirm you're 18 or older to create an account";

type Fields = { name: string; email: string; password: string; isAdult: boolean };
type FieldErrors = Partial<Record<keyof Fields, string>>;

const check = ({ name, email, password, isAdult }: Fields): FieldErrors => ({
  ...(name.trim() ? {} : { name: "Enter the name other players will see" }),
  ...(email.trim() ? {} : { email: "Enter your email" }),
  ...(password.length >= MIN_PASSWORD_LENGTH
    ? {}
    : { password: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password` }),
  ...(isAdult ? {} : { isAdult: ADULT_ERROR }),
});

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [tried, setTried] = useState(false);
  const [triedSocial, setTriedSocial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = { name, email, password, isAdult };
  // Validate on submit, then live once a field has shown an error.
  const fieldErrors = tried ? check(fields) : {};
  const adultError = fieldErrors.isAdult ?? (triedSocial && !isAdult ? ADULT_ERROR : null);

  const submit = async () => {
    setTried(true);
    if (Object.keys(check(fields)).length > 0) return;
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
            ? "There's already an account with that email. Sign in instead."
            : (result.error.message ?? "Couldn't create your account. Try again."),
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
    <Screen
      title="Create your account"
      subtitle="Find players at your level around Detroit and set up matches and hitting sessions."
    >
      <View style={styles.group}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          hint="What other players will call you"
        />
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
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Checkbox
          checked={isAdult}
          onChange={setIsAdult}
          error={adultError}
          label="I'm 18 or older. Love All is for adult players only."
        />
        <ErrorBanner>{error}</ErrorBanner>
        <Button label="Create account" onPress={() => void submit()} loading={submitting} />
      </View>

      <Divider label="or" />
      <SocialSignIn
        disabled={submitting}
        onBeforeSignIn={() => {
          setTriedSocial(true);
          if (!isAdult) return false;
          rememberAdultConfirmation(true);
        }}
      />

      <View style={styles.switch}>
        <Text variant="caption" color="textMuted">
          Already have an account?
        </Text>
        <Button
          variant="quiet"
          size="small"
          label="Sign in"
          onPress={() => router.replace("/sign-in")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[4] },
  switch: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[1] },
});
