import { expo } from "@better-auth/expo";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";

/** Who a user is to the app. Admins can use the moderation endpoints. */
export const roles = ["player", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * Credentials for the social sign-in providers. A provider whose credentials
 * are missing is left off, so local dev and CI run with email and password only.
 */
export interface SocialProviders {
  readonly google?: {
    /** Every Google client id we accept: web (first), iOS and Android. */
    readonly clientIds: ReadonlyArray<string>;
    readonly clientSecret: string;
  };
  readonly apple?: {
    /** The Services ID (web flow) first, then the app's bundle id (native flow). */
    readonly clientIds: ReadonlyArray<string>;
    /** The signed client secret JWT generated from the Apple key. */
    readonly clientSecret: string;
    readonly appBundleIdentifier?: string;
  };
}

export interface AuthOptions {
  /** Where Better Auth keeps users and sessions. The API uses `effectSqlAdapter`. */
  readonly database: NonNullable<BetterAuthOptions["database"]>;
  /** Whether a moderator suspended this player (a row in `account_suspension`). */
  readonly isSuspended: (userId: string) => Promise<boolean>;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly socialProviders?: SocialProviders;
  /** How rate limiting finds the client IP behind the VPS's reverse proxy. */
  readonly ipAddress?: IpAddress;
  /**
   * Runs before Better Auth deletes a player, with their id, for cleanup the
   * database's cascades don't cover (`AccountDeletion.prepare`). Throwing
   * stops the delete.
   */
  readonly beforeDeleteUser?: (userId: string) => Promise<void>;
}

export interface IpAddress {
  /** Headers the proxy sets with the client IP, in order. Better Auth defaults to `x-forwarded-for`. */
  readonly headers?: ReadonlyArray<string>;
  /** Proxy IPs or CIDR ranges that append to `x-forwarded-for`, skipped when finding the client. */
  readonly trustedProxies?: ReadonlyArray<string>;
}

const appleOrigin = "https://appleid.apple.com";

const passwordToDelete = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/delete-user" || ctx.body?.password) return;

  const session = await getSessionFromCtx(ctx);

  if (!session) return;

  const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id);

  if (accounts.some((a) => a.providerId === "credential")) {
    throw APIError.from("BAD_REQUEST", {
      message: "Enter your password to delete your account.",
      code: "PASSWORD_REQUIRED",
    });
  }
});

/**
 * Better Auth runs inside the API process. `BetterAuth.ts` builds it on the
 * app's Effect SQL client, so auth shares the API's pool and transactions.
 *
 * Players can delete their account (`POST /api/auth/delete-user`). Players
 * with a password confirm with it, however fresh their session is. Players
 * who only use Google or Apple have no password, so Better Auth asks for a
 * fresh session instead (`session.freshAge`, a day by default): an older one
 * gets `SESSION_EXPIRED` and signs in again first.
 *
 * Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
 */
export const makeAuth = (options: AuthOptions) => {
  const { google, apple } = options.socialProviders ?? {};
  const { headers, trustedProxies } = options.ipAddress ?? {};

  return betterAuth({
    appName: "Love All",
    database: options.database,
    advanced: {
      ipAddress: {
        ...(headers && headers.length > 0 && { ipAddressHeaders: [...headers] }),
        ...(trustedProxies && trustedProxies.length > 0 && { trustedProxies: [...trustedProxies] }),
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (await options.isSuspended(session.userId)) {
              throw APIError.from("FORBIDDEN", {
                message:
                  "This account is suspended. Contact support if you think this is a mistake.",
                code: "ACCOUNT_SUSPENDED",
              });
            }
          },
        },
      },
    },
    hooks: { before: passwordToDelete },
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...(google && {
        google: { clientId: [...google.clientIds], clientSecret: google.clientSecret },
      }),
      ...(apple && {
        apple: {
          clientId: [...apple.clientIds],
          clientSecret: apple.clientSecret,
          ...(apple.appBundleIdentifier && { appBundleIdentifier: apple.appBundleIdentifier }),
        },
      }),
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await options.beforeDeleteUser?.(user.id);
        },
      },
      additionalFields: {
        role: {
          type: [...roles],
          required: false,
          defaultValue: "player",
          input: false,
        },
        adultConfirmedAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    trustedOrigins: apple ? [...options.trustedOrigins, appleOrigin] : [...options.trustedOrigins],
    plugins: [expo()],
  });
};

export type Auth = ReturnType<typeof makeAuth>;
