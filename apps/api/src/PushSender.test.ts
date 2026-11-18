import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { describe, expect, it } from "vite-plus/test";
import { EXPO_BATCH_SIZE, type PushMessage, PushSender } from "./PushSender";

/** The part of each sent message the tests check. */
const SentBody = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      to: Schema.String,
      sound: Schema.String,
      channelId: Schema.String,
      data: Schema.Struct({ url: Schema.String }),
    }),
  ),
);

const decodeSentBody = Schema.decodeUnknownSync(SentBody);

type SentRequest = { url: string; body: typeof SentBody.Type };

/** Runs `PushSender.expo` against a fake `fetch` that answers every message with "ok". */
const sendWith = (messages: ReadonlyArray<PushMessage>) => {
  const requests: Array<SentRequest> = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const body = decodeSentBody(new TextDecoder().decode(init?.body as Uint8Array));
    requests.push({ url: input.toString(), body });
    return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "x" })) }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return Effect.gen(function* () {
    const sender = yield* PushSender;
    return yield* sender.send(messages);
  }).pipe(
    Effect.provide(PushSender.expo),
    Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
    Effect.runPromise,
    (promise) => promise.then((tickets) => ({ tickets, requests })),
  );
};

const message = (i: number): PushMessage => ({
  to: `ExponentPushToken[${i}]`,
  title: "Title",
  body: "Body",
  data: { url: "/sessions/1" },
});

describe("PushSender.expo", () => {
  it("posts to Expo in batches of 100 and returns one ticket per message", async () => {
    const messages = Array.from({ length: EXPO_BATCH_SIZE + 1 }, (_, i) => message(i));
    const { tickets, requests } = await sendWith(messages);
    expect(requests.map((r) => r.body.length)).toEqual([EXPO_BATCH_SIZE, 1]);
    expect(requests[0]!.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(requests[0]!.body[0]).toMatchObject({
      to: "ExponentPushToken[0]",
      sound: "default",
      channelId: "default",
      data: { url: "/sessions/1" },
    });
    expect(tickets).toHaveLength(EXPO_BATCH_SIZE + 1);
  });
});
