import { Effect, Layer } from "effect";
import { type PushMessage, PushSender, type PushTicket } from "../PushSender";

/**
 * A `PushSender` that keeps what it was given instead of calling Expo.
 * Tokens in `gone` get a `DeviceNotRegistered` ticket, as Expo answers for a
 * deleted app.
 */
export const makePushSenderMemory = (gone: ReadonlySet<string> = new Set()) => {
  const sent: Array<PushMessage> = [];
  const layer = Layer.succeed(
    PushSender,
    PushSender.of({
      send: (messages) =>
        Effect.sync(() => {
          sent.push(...messages);
          return messages.map((message): PushTicket =>
            gone.has(message.to)
              ? { status: "error", details: { error: "DeviceNotRegistered" } }
              : { status: "ok" },
          );
        }),
    }),
  );
  return { sent, layer };
};
