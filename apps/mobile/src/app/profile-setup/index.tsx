import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Avatar, Button, Loading, Screen, space, TextField } from "@/design";
import { StepScreen } from "@/features/profile/components";
import { DISPLAY_NAME_MAX, stepError } from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";

/** Step 1: the name and photo other players see. */
export default function BasicsScreen() {
  const { draft, update, loading } = useProfileDraft();
  const [tried, setTried] = useState(false);
  const error = stepError(draft, "basics");

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) update({ photoUri: asset.uri });
  };

  if (loading) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Loading label="Loading your profile" />
      </Screen>
    );
  }

  return (
    <StepScreen
      step={1}
      title="Your name and photo"
      subtitle="This is how other players will see you."
      error={null}
      actionLabel="Next"
      onAction={() => {
        setTried(true);
        if (!error) router.push("/profile-setup/home");
      }}
    >
      <View style={styles.photoRow}>
        <Avatar name={draft.displayName} photoUrl={draft.photoUri} size="lg" />
        <Button
          variant="secondary"
          size="small"
          label={draft.photoUri ? "Change photo" : "Add a photo"}
          onPress={() => void pickPhoto()}
        />
      </View>

      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) => update({ displayName })}
        error={tried ? (error ?? undefined) : undefined}
        hint="Your first name or a nickname"
        maxLength={DISPLAY_NAME_MAX}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="nickname"
        returnKeyType="next"
        onSubmitEditing={() => {
          setTried(true);
          if (!error) router.push("/profile-setup/home");
        }}
      />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: "row", alignItems: "center", gap: space[4] },
});
