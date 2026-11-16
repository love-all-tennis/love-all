import { NodeHttpServer } from "@effect/platform-node";
import { Api } from "@love-all/domain";
import { Config, Effect, Layer } from "effect";
import { HttpEffect, HttpMiddleware, HttpRouter } from "effect/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { createServer } from "node:http";
import { Accounts } from "./Accounts";
import { AuthenticationLive } from "./Authentication";
import { BetterAuth, TrustedOrigins } from "./BetterAuth";
import { Db } from "./Db";
import { Follows } from "./Follows";
import { ApiHandlers } from "./Handlers";
import { Profiles } from "./Profiles";

/** Better Auth's own routes (sign-up, sign-in, OAuth callbacks, sessions). */
const AuthRoutes = Layer.effectDiscard(
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    const router = yield* HttpRouter.HttpRouter;
    yield* router.add("*", "/api/auth/*", HttpEffect.fromWebHandler(auth.handler));
  }),
);

const ApiRoutes = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(ApiHandlers),
  Layer.provide([AuthenticationLive, Accounts.layer, Profiles.layer, Follows.layer]),
);

const DocsRoute = HttpApiScalar.layer(Api, { path: "/docs" });

export const AllRoutes = Layer.mergeAll(ApiRoutes, AuthRoutes, DocsRoute).pipe(
  Layer.provide([BetterAuth.layer, Db.layer]),
);

export const HttpLive = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* Config.Port("PORT").pipe(Config.withDefault(3000));
    const allowedOrigins = yield* TrustedOrigins;
    return HttpRouter.serve(AllRoutes, {
      middleware: HttpMiddleware.cors({ allowedOrigins, credentials: true }),
    }).pipe(Layer.provide(NodeHttpServer.layer(createServer, { port })));
  }),
);
