import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button, Card, Screen, space, Text } from "@/design";
import { authClient } from "@/lib/auth-client";
import { signOut } from "@/lib/sign-out";

/**
 * The way into the players list and the Play tab, and account actions.
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

      <Card>
        <Text variant="subheading">Matches and hitting sessions</Text>
        <Text color="textMuted">
          Set up a match or hitting session, answer invites, and find open sessions nearby.
        </Text>
        <View style={styles.action}>
          <Button variant="secondary" label="Go to Play" onPress={() => router.navigate("/play")} />
        </View>
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
        <Button variant="quiet" label="Sign out" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { paddingTop: space[2] },
  account: { gap: space[3] },
});
