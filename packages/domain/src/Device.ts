import { Schema } from "effect";

/**
 * An Expo push token, as `getExpoPushTokenAsync` returns it:
 * `ExponentPushToken[...]` (or the older `ExpoPushToken[...]`).
 */
export const PushToken = Schema.String.check(
  Schema.isPattern(/^Expo(nent)?PushToken\[[^\]]{1,200}\]$/),
);
export type PushToken = typeof PushToken.Type;

export const DevicePlatform = Schema.Literals(["ios", "android"]);
export type DevicePlatform = typeof DevicePlatform.Type;

/** `POST /devices` body: this phone's push token, sent after each sign-in. */
export const NewDevice = Schema.Struct({
  token: PushToken,
  platform: DevicePlatform,
});
export type NewDevice = typeof NewDevice.Type;
