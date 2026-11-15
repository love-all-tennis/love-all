import { Authentication, CurrentUser, SessionUser, Unauthorized } from "@love-all/domain";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/http";
import { BetterAuth } from "./BetterAuth";

/** Server side of the `Authentication` middleware: Better Auth session → `CurrentUser`. */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    return Authentication.of(
      Effect.fn("Authentication")(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const session = yield* Effect.promise(() =>
          auth.api.getSession({ headers: new Headers(request.headers as Record<string, string>) }),
        );
        if (!session) {
          return yield* new Unauthorized({ message: "Sign in to continue" });
        }
        const user = new SessionUser({
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
        });
        return yield* Effect.provideService(httpEffect, CurrentUser, user);
      }),
    );
  }),
);
