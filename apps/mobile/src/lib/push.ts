import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { callApi } from "./api";

/** The token this phone last registered, so signing out can remove it. */
const TOKEN_KEY = "loveall.pushToken";

/** Push only works on a real iOS or Android device. */
const supported = Platform.OS !== "web" && Device.isDevice;

// Show notifications that arrive while the app is open, too.
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks for permission (once; iOS and Android remember the answer), gets this
 * phone's Expo push token, and registers it with the API for the signed-in
 * player. Quietly does nothing on the web, in a simulator, when permission is
 * refused, or when the app has no EAS project id yet.
 */
export async function registerForPush(): Promise<void> {
  if (!supported) return;
  if (Platform.OS === "android") {
    // The API sends on this channel.
    await Notifications.setNotificationChannelAsync("default", {
      name: "Matches, sessions and replies",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  if (!granted && canAskAgain) {
    ({ granted } = await Notifications.requestPermissionsAsync());
  }
  if (!granted) return;

  let token: string;
  try {
    // The EAS project id comes from app config (`extra.eas.projectId`, set by `eas init`).
    ({ data: token } = await Notifications.getExpoPushTokenAsync());
  } catch (error) {
    console.warn("No push token: is the EAS project set up?", error);
    return;
  }
  await callApi((api) =>
    api.devices.register({
      payload: { token, platform: Platform.OS === "ios" ? "ios" : "android" },
    }),
  );
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * Stops pushes to this phone for the signed-in player. Call before signing
 * out, while the session still works. Never throws: signing out goes ahead
 * even if the API can't be reached.
 */
export async function unregisterForPush(): Promise<void> {
  if (!supported) return;
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await callApi((api) => api.devices.unregister({ params: { token } }));
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.warn("Couldn't remove the push token", error);
  }
}

/**
 * Forgets this phone's push token without calling the API, for when the
 * account it was registered to is gone.
 */
export async function forgetPushToken() {
  if (!supported) return;

  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.warn("Couldn't forget the push token", error);
  }
}
