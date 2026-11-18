import {
  Array as Arr,
  Config,
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

/** One notification for one Expo push token. */
export interface PushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  /** What the app opens on tap: `{ url: "/sessions/<id>" }`. */
  readonly data: { readonly url: string };
}

const PushTicket = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ok") }),
  Schema.Struct({
    status: Schema.Literal("error"),
    message: Schema.optionalKey(Schema.String),
    details: Schema.optionalKey(Schema.Struct({ error: Schema.optionalKey(Schema.String) })),
  }),
]);

export type PushTicket = typeof PushTicket.Type;

const PushResponse = Schema.Struct({ data: Schema.Array(PushTicket) });

/** Sending to Expo failed as a whole (network, 5xx, a response we can't read). */
export class PushSendError extends Data.TaggedError("PushSendError")<{
  readonly cause: unknown;
}> {}

/** Expo takes at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Hands notifications to Expo's push service, which forwards them to APNs and
 * FCM. `send` returns one ticket per message, in order. Tests swap in a layer
 * that records messages instead.
 */
export class PushSender extends Context.Service<
  PushSender,
  {
    readonly send: (
      messages: ReadonlyArray<PushMessage>,
    ) => Effect.Effect<ReadonlyArray<PushTicket>, PushSendError>;
  }
>()("love-all/PushSender") {
  /**
   * Expo's push API. `EXPO_ACCESS_TOKEN` is only needed once "enhanced push
   * security" is turned on for the Expo project.
   */
  static readonly expo = Layer.effect(
    PushSender,
    Effect.gen(function* () {
      const accessToken = yield* Config.option(Config.Redacted("EXPO_ACCESS_TOKEN"));
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

      const sendBatch = (batch: ReadonlyArray<PushMessage>) =>
        HttpClientRequest.post(EXPO_PUSH_URL).pipe(
          HttpClientRequest.acceptJson,
          (request) =>
            Option.match(accessToken, {
              onNone: () => request,
              onSome: (token) => HttpClientRequest.bearerToken(request, Redacted.value(token)),
            }),
          HttpClientRequest.bodyJson(
            batch.map((message) => ({ ...message, sound: "default", channelId: "default" })),
          ),
          Effect.flatMap(client.execute),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(PushResponse)),
          Effect.map((response) => response.data),
          Effect.mapError((cause) => new PushSendError({ cause })),
        );

      return PushSender.of({
        send: (messages) =>
          Effect.forEach(Arr.chunksOf(messages, EXPO_BATCH_SIZE), sendBatch).pipe(
            Effect.map(Arr.flatten),
            Effect.withSpan("PushSender.send", { attributes: { count: messages.length } }),
          ),
      });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
