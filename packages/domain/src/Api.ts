import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Authentication, SessionUser } from "./Auth";

export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
});
export type Health = typeof Health.Type;

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
) {}

export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/me", { success: SessionUser }))
  .middleware(Authentication) {}

/** The whole Love All API. Shared by the server and the mobile client. */
export class Api extends HttpApi.make("love-all")
  .add(SystemApi)
  .add(MeApi)
  .annotateMerge(OpenApi.annotations({ title: "Love All API" })) {}
