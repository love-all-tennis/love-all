import { Option, Schema } from "effect";
import type * as Notifications from "expo-notifications";

const ROUTES = [/^\/sessions\/[\w-]+$/, /^\/forum\/thread\/[\w-]+$/, /^\/messages\/[\w-]+$/];

export type NotificationRoute =
  | `/sessions/${string}`
  | `/forum/thread/${string}`
  | `/messages/${string}`;

const NotificationData = Schema.Struct({ url: Schema.String });

const decodeNotificationData = Schema.decodeUnknownOption(NotificationData);

const isNotificationRoute = (url: string): url is NotificationRoute =>
  ROUTES.some((route) => route.test(url));

export function notificationRoute(data: Notifications.NotificationContent["data"] | null) {
  return decodeNotificationData(data).pipe(
    Option.map(({ url }) => url),
    Option.filter(isNotificationRoute),
    Option.getOrNull,
  );
}
