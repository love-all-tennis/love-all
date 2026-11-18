import { Effect, Layer } from "effect";
import { type AppleToken, AppleTokens } from "../AppleTokens";

/** An `AppleTokens` that keeps the tokens it was asked to revoke instead of calling Apple. */
export const makeAppleTokensMemory = () => {
  const revoked: Array<AppleToken> = [];

  const layer = Layer.succeed(
    AppleTokens,
    AppleTokens.of({ revoke: (token) => Effect.sync(() => void revoked.push(token)) }),
  );

  return { revoked, layer };
};
