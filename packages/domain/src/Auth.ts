import { Context, Schema } from "effect";
import { HttpApiMiddleware } from "effect/http-api";

/** The signed-in player, as resolved from the Better Auth session. */
export class SessionUser extends Schema.Class<SessionUser>("SessionUser")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {}

/** Provided to every handler behind the `Authentication` middleware. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()(
  "love-all/CurrentUser",
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

/**
 * Resolves the Better Auth session from the request headers and provides
 * `CurrentUser`. Clients authenticate with the session cookie, so nothing
 * extra is required on the client side.
 */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  {
    provides: CurrentUser;
    requires: never;
  }
>()("love-all/Authentication", {
  error: Unauthorized,
}) {}
