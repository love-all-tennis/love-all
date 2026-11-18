const ROUTES = [/^\/sessions\/[\w-]+$/, /^\/forum\/thread\/[\w-]+$/, /^\/messages\/[\w-]+$/];

export type NotificationRoute =
  | `/sessions/${string}`
  | `/forum/thread/${string}`
  | `/messages/${string}`;

export function notificationRoute(data: unknown) {
  if (typeof data !== "object" || data === null || !("url" in data)) return null;
  const { url } = data;
  if (typeof url !== "string") return null;
  return ROUTES.some((route) => route.test(url)) ? (url as NotificationRoute) : null;
}
