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
import { Forum } from "./Forum";
import { Notifications } from "./Notifications";
import { PushSender } from "./PushSender";
import { ApiHandlers } from "./Handlers";
import { Players } from "./Players";
import { Profiles } from "./Profiles";
import { Safety } from "./Safety";
import { SessionActivity } from "./SessionActivity";
import { SessionReminders } from "./SessionReminders";
import { Sessions } from "./Sessions";
import { SessionJoins } from "./SessionJoins";

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
  Layer.provide([
    AuthenticationLive,
    Accounts.layer,
    Follows.layer,
    Players.layer,
    Profiles.layer,
    Safety.layer.pipe(Layer.provideMerge(Forum.layer)),
    SessionJoins.layer,
    SessionActivity.layer.pipe(Layer.provideMerge(Sessions.layer)),
  ]),
);

/** Sends "starting soon" reminders in the background while the server runs. */
const Reminders = SessionReminders.schedule.pipe(Layer.provide(SessionReminders.layer));

const DocsRoute = HttpApiScalar.layer(Api, { path: "/docs" });

export const AllRoutes = Layer.mergeAll(ApiRoutes, AuthRoutes, DocsRoute, Reminders).pipe(
  // Notifications is shared, so notices from every service go through one sender.
  Layer.provide(Notifications.layer.pipe(Layer.provide(PushSender.expo))),
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
