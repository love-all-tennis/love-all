import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { describe, expect, it } from "vite-plus/test";
import { EXPO_BATCH_SIZE, type PushMessage, PushSender } from "./PushSender";

const sendWith = (messages: ReadonlyArray<PushMessage>) => {
  const requests: Array<{ url: string; body: Array<Record<string, unknown>> }> = [];
  const fakeFetch = (async (input: string | URL, init?: RequestInit) => {
    const body = JSON.parse(new TextDecoder().decode(init?.body as Uint8Array)) as Array<
      Record<string, unknown>
    >;
    requests.push({ url: input.toString(), body });
    return new Response(JSON.stringify({ data: body.map(() => ({ status: "ok", id: "x" })) }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return PushSender.use((sender) => sender.send(messages)).pipe(
    Effect.provide(PushSender.expo),
    Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
    Effect.runPromise,
    (promise) => promise.then((tickets) => ({ tickets, requests })),
  );
};

const message = (i: number) => ({
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
