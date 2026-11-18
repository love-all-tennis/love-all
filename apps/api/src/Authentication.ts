import { Authentication, CurrentUser, Role, SessionUser, Unauthorized } from "@love-all/domain";
import { Effect, Layer, Schema } from "effect";
import { HttpServerRequest } from "effect/http";
import { BetterAuth } from "./BetterAuth";

const isRole = Schema.is(Role);

/**
 * Server side of the `Authentication` middleware: Better Auth session → `CurrentUser`.
 *
 * Better Auth reads the session cookie (or the Expo plugin's cookie header) and
 * returns null when it is missing, expired or revoked; all of those are
 * `Unauthorized`. A failure to reach the database is a defect (500), not a
 * sign-in problem.
 */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;

    return Authentication.of(
      Effect.fn("Authentication")(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;

        const session = yield* Effect.tryPromise(() =>
          // WARNING: Node gives single-valued strings for every header Better Auth reads here.
          auth.api.getSession({ headers: new Headers(request.headers as Record<string, string>) }),
        ).pipe(Effect.orDie);

        if (!session) {
          return yield* new Unauthorized({ message: "Sign in to continue" });
        }

        const { id, name, email, role } = session.user;
        const user = new SessionUser({ id, name, email, role: isRole(role) ? role : "player" });

        return yield* Effect.provideService(httpEffect, CurrentUser, user);
      }),
    );
  }),
);
