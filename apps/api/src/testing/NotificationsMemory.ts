import { Effect, Layer } from "effect";
import { type Notice, Notifications } from "../Notifications";

/**
 * A `Notifications` that keeps every notice instead of sending it, so tests
 * can check who would hear about what. Token handling and block filtering
 * are covered by `Notifications.db.test.ts`.
 */
export const makeNotificationsMemory = () => {
  const notices: Array<Notice> = [];
  const layer = Layer.succeed(
    Notifications,
    Notifications.of({
      register: () => Effect.void,
      unregister: () => Effect.void,
      notify: (notice) => Effect.sync(() => void notices.push(notice)),
      flush: Effect.void,
    }),
  );
  /** Notices about one app route, such as `/sessions/<id>`. */
  const about = (url: string) => notices.filter((n) => n.url === url);
  return { notices, layer, about };
};
