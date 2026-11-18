import {
  DEFAULT_ACTION_IDENTIFIER,
  clearLastNotificationResponse,
  useLastNotificationResponse,
} from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { registerForPush } from "@/lib/push";
import { notificationRoute } from "./links";

/**
 * Turns on push notifications for the signed-in player once they're in the
 * app: asks for permission the first time, registers this phone with the
 * API, and opens the session or forum thread a tapped notification is about,
 * including the tap that launched the app. Native only.
 */
export function usePushNotifications() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;

  // Register again for each account that signs in on this phone.
  useEffect(() => {
    if (!userId) {
      return;
    }
    registerForPush().catch((error: unknown) => {
      // oxlint-disable-next-line no-console -- Push is best effort; this warning is the only trace when it fails.
      console.warn("Couldn't register for push notifications", error);
    });
  }, [userId]);

  const response = useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) {
      return;
    }
    const route = notificationRoute(response.notification.request.content.data);
    if (route) {
      router.push(route);
    }
    // Handled: don't open it again on the next render or launch.
    clearLastNotificationResponse();
  }, [response]);
}
