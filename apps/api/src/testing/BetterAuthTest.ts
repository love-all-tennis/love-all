import { Layer } from "effect";
import { AccountDeletion } from "../AccountDeletion";
import type { AppleTokens } from "../AppleTokens";
import { BetterAuth } from "../BetterAuth";
import { Db } from "../Db";
import type { Notifications } from "../Notifications";
import { SessionJoins } from "../SessionJoins";

/**
 * Better Auth on the test database, with account deletion wired up the way
 * `Http.ts` does it, on the given in-memory notifications and Apple tokens
 * (`makeNotificationsMemory`, `makeAppleTokensMemory`). Also provides `Db`.
 */
export const betterAuthTestLayer = (
  notifications: Layer.Layer<Notifications>,
  apple: Layer.Layer<AppleTokens>,
) =>
  BetterAuth.layer.pipe(
    Layer.provide(AccountDeletion.layer),
    Layer.provide([SessionJoins.layer, apple]),
    Layer.provide(notifications),
    Layer.provideMerge(Db.layer),
  );
