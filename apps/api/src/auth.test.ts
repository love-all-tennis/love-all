import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vite-plus/test";
import { makeAuth } from "./auth";

const auth = makeAuth({
  database: memoryAdapter({}),
  isSuspended: async () => false,
  trustedOrigins: [],
  ipAddress: { headers: ["x-real-ip"], trustedProxies: ["172.18.0.0/16"] },
});

describe("makeAuth", () => {
  it("answers the health check under /api/auth", async () => {
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/ok"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("names the app and passes the proxy settings through", () => {
    expect(auth.options.appName).toBe("Love All");
    expect(auth.options.advanced?.ipAddress).toEqual({
      ipAddressHeaders: ["x-real-ip"],
      trustedProxies: ["172.18.0.0/16"],
    });
  });
});
