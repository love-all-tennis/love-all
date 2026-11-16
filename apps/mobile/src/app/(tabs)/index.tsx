import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, Card, Screen, space, Text } from "@/design";
import { authClient } from "@/lib/auth-client";

/**
 * A placeholder until upcoming matches and hitting sessions arrive (#13):
 * the way into the players list, and account actions.
 */
export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const firstName = session?.user.name.split(/\s+/)[0];

  return (
    <Screen title={firstName ? `Hi, ${firstName}` : "Home"} edges={["top", "left", "right"]}>
      <Card>
        <Text variant="subheading">Find someone to play</Text>
        <Text color="textMuted">
          Browse players near you at your level, and follow the ones you'd like to hit with.
        </Text>
        <View style={styles.action}>
          <Button label="Browse players" onPress={() => router.navigate("/players")} />
        </View>
      </Card>

      <Card tone="sunken">
        <Text variant="subheading">Matches and hitting sessions</Text>
        <Text color="textMuted">
          Setting up matches and hitting sessions is coming next. They'll show here.
        </Text>
      </Card>

      <View style={styles.account}>
        <Text variant="heading" accessibilityRole="header">
          Your account
        </Text>
        <Button
          variant="secondary"
          label="Edit your profile"
          onPress={() => router.push("/profile-setup")}
        />
        <Button variant="quiet" label="Sign out" onPress={() => void authClient.signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { paddingTop: space[2] },
  account: { gap: space[3] },
});
