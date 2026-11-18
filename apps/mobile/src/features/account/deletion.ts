import type { SocialProvider } from "@/lib/auth-client";

/**
 * How a player confirms deleting their account: with their password if they
 * have one, or else by signing in again with Apple or Google, since the API
 * only takes a delete without a password from a fresh session.
 */
export type DeletionCheck = { kind: "password" } | { kind: "sign-in"; provider: SocialProvider };

export const deletionCheck = (providerIds: ReadonlyArray<string>) => {
  const check: DeletionCheck = providerIds.includes("credential")
    ? { kind: "password" }
    : { kind: "sign-in", provider: providerIds.includes("apple") ? "apple" : "google" };

  return check;
};

export const providerName = (provider: SocialProvider) =>
  provider === "apple" ? "Apple" : "Google";

/** What went wrong with a delete, from Better Auth's error code. */
export const deletionProblem = (code: string | undefined) => {
  switch (code) {
    case "INVALID_PASSWORD":
      return { kind: "password", message: "That password isn't right. Check it and try again." };
    case "PASSWORD_REQUIRED":
      return { kind: "password", message: "Enter your password to delete your account." };
    case "SESSION_EXPIRED":
      return { kind: "sign-in", message: "To keep your account safe, sign in again to confirm." };
    default:
      return { kind: "other", message: "Couldn't delete your account. Try again." };
  }
};
