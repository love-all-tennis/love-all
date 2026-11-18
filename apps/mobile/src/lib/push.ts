import { isDevice } from "expo-device";
import {
  AndroidImportance,
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from "expo-notifications";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import { Platform } from "react-native";

import { callApi } from "./api";

/** The token this phone last registered, so signing out can remove it. */
const TOKEN_KEY = "loveall.pushToken";

/** Push only works on a real iOS or Android device. */
const supported = Platform.OS !== "web" && isDevice;

// Show notifications that arrive while the app is open, too.
if (supported) {
  setNotificationHandler({
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
  if (!supported) {
    return;
  }
  if (Platform.OS === "android") {
    // The API sends on this channel.
    await setNotificationChannelAsync("default", {
      name: "Matches, sessions and replies",
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await getPermissionsAsync();
  let { granted } = current;
  if (!granted && current.canAskAgain) {
    ({ granted } = await requestPermissionsAsync());
  }
  if (!granted) {
    return;
  }

  let token: string;
  try {
    // The EAS project id comes from app config (`extra.eas.projectId`, set by `eas init`).
    ({ data: token } = await getExpoPushTokenAsync());
  } catch (error) {
    // oxlint-disable-next-line no-console -- Push is best effort; this warning is the only trace when it fails.
    console.warn("No push token: is the EAS project set up?", error);
    return;
  }
  await callApi((api) =>
    api.devices.register({
      payload: { token, platform: Platform.OS === "ios" ? "ios" : "android" },
    }),
  );
  await setItemAsync(TOKEN_KEY, token);
}

/**
 * Stops pushes to this phone for the signed-in player. Call before signing
 * out, while the session still works. Never throws: signing out goes ahead
 * even if the API can't be reached.
 */
export async function unregisterForPush(): Promise<void> {
  if (!supported) {
    return;
  }
  try {
    const token = await getItemAsync(TOKEN_KEY);
    if (!token) {
      return;
    }
    await callApi((api) => api.devices.unregister({ params: { token } }));
    await deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    // oxlint-disable-next-line no-console -- Push is best effort; this warning is the only trace when it fails.
    console.warn("Couldn't remove the push token", error);
  }
}

/**
 * Forgets this phone's push token without calling the API, for when the
 * account it was registered to is gone.
 */
export async function forgetPushToken() {
  if (!supported) {
    return;
  }

  try {
    await deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    // oxlint-disable-next-line no-console -- Push is best effort; this warning is the only trace when it fails.
    console.warn("Couldn't forget the push token", error);
  }
}
