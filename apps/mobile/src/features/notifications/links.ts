/**
 * Where a tapped push notification goes. The API puts an app route in the
 * notification's `data.url`; only routes the app knows are followed, so a
 * malformed or unexpected payload just opens the app.
 */
const ROUTES = [/^\/sessions\/[\w-]+$/, /^\/forum\/thread\/[\w-]+$/, /^\/messages\/[\w-]+$/];

export type NotificationRoute =
  | `/sessions/${string}`
  | `/forum/thread/${string}`
  | `/messages/${string}`;

export function notificationRoute(data: unknown): NotificationRoute | null {
  if (typeof data !== "object" || data === null || !("url" in data)) {
    return null;
  }
  const { url } = data;
  if (typeof url !== "string") {
    return null;
  }
  return ROUTES.some((route) => route.test(url)) ? (url as NotificationRoute) : null;
}
