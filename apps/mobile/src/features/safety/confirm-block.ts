import { Alert, Platform } from "react-native";

/**
 * Asks before blocking, since it can't be undone from the profile. The
 * destructive button is named for the action, never "OK".
 */
export const confirmBlock = (name: string, onConfirm: () => void): void => {
  const title = `Block ${name}?`;
  const message =
    "They won't be able to find you or see your profile, and you won't see them. Any follows between you are removed.";
  if (Platform.OS === "web") {
    // react-native-web has no Alert.
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Block", style: "destructive", onPress: onConfirm },
  ]);
};
