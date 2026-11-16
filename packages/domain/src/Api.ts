import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Authentication } from "./Auth";
import { Availability, Me, ProfilePatch } from "./Profile";

export const Health = Schema.Struct({
  status: Schema.Literal("ok"),
});
export type Health = typeof Health.Type;

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Health }),
) {}

/** The signed-in player's own account, profile and availability. */
export class MeApi extends HttpApiGroup.make("me")
  .add(HttpApiEndpoint.get("get", "/me", { success: Me }))
  .add(HttpApiEndpoint.patch("update", "/me", { payload: ProfilePatch, success: Me }))
  .add(
    HttpApiEndpoint.put("replaceAvailability", "/me/availability", {
      payload: Availability,
      success: Availability,
    }),
  )
  /**
   * Records that the signed-in player confirmed they are 18 or older. The app
   * asks once, right after sign-up (or the first social sign-in). Calling it
   * again keeps the first confirmation time.
   */
  .add(HttpApiEndpoint.post("confirmAdult", "/me/adult-confirmation"))
  .middleware(Authentication) {}

/** The whole Love All API. Shared by the server and the mobile client. */
export class Api extends HttpApi.make("love-all")
  .add(SystemApi)
  .add(MeApi)
  .annotateMerge(OpenApi.annotations({ title: "Love All API" })) {}
