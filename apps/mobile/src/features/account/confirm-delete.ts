import { Alert, Platform } from "react-native";

/** The last check before an account is deleted, since it can't be undone. */
export const confirmDelete = (onConfirm: () => void) => {
  const title = "Delete your account?";
  const message = "Your profile, posts, sessions and messages are deleted for good.";

  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) {
      onConfirm();
    }

    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete account", style: "destructive", onPress: onConfirm },
  ]);
};
