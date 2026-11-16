import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { FieldLabel, StepScreen } from "@/features/profile/components";
import { DISPLAY_NAME_MAX, stepError } from "@/features/profile/draft";
import { useProfileDraft } from "@/features/profile/draft-context";
import { useTheme } from "@/hooks/use-theme";

/** Step 1: the name and photo other players see. */
export default function BasicsScreen() {
  const theme = useTheme();
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
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <StepScreen
      step={1}
      title="Who's playing?"
      subtitle="This is how other players will see you."
      error={tried ? error : null}
      actionLabel="Next"
      onAction={() => {
        setTried(true);
        if (!error) router.push("/profile-setup/home");
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={draft.photoUri ? "Change photo" : "Add a photo"}
        onPress={() => void pickPhoto()}
        style={styles.photoRow}
      >
        <View style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
          {draft.photoUri ? (
            <Image source={{ uri: draft.photoUri }} style={styles.photo} contentFit="cover" />
          ) : (
            <ThemedText type="subtitle" themeColor="textSecondary">
              {draft.displayName.trim().charAt(0).toUpperCase() || "+"}
            </ThemedText>
          )}
        </View>
        <ThemedText type="linkPrimary">
          {draft.photoUri ? "Change photo" : "Add a photo"}
        </ThemedText>
      </Pressable>

      <FieldLabel>Display name</FieldLabel>
      <TextInput
        value={draft.displayName}
        onChangeText={(displayName) => update({ displayName })}
        placeholder="First name or nickname"
        placeholderTextColor={theme.textSecondary}
        maxLength={DISPLAY_NAME_MAX}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  photoRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - Spacing.one,
    fontSize: 16,
  },
});
