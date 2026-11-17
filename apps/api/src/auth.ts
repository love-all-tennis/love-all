import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./db/schema";

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
  readonly databaseUrl: string;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly socialProviders?: SocialProviders;
}

/** Apple posts the OAuth callback back to us from its own origin. */
const appleOrigin = "https://appleid.apple.com";

/**
 * Better Auth runs inside the API process.
 *
 * Its Drizzle adapter awaits promise-based queries, so it gets its own small
 * node-postgres pool on the same database. App code uses the Effect driver
 * (see `Db.ts`). Both share one Drizzle schema.
 *
 * Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
 */
export const makeAuth = (options: AuthOptions) => {
  const { google, apple } = options.socialProviders ?? {};
  const db = drizzle({ client: new Pool({ connectionString: options.databaseUrl, max: 5 }) });
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    databaseHooks: {
      session: {
        create: {
          // Suspended players can't sign in. Suspending also deletes their sessions.
          before: async (session) => {
            const [suspended] = await db
              .select({ userId: schema.accountSuspension.userId })
              .from(schema.accountSuspension)
              .where(eq(schema.accountSuspension.userId, session.userId));
            if (suspended) {
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
      additionalFields: {
        role: {
          type: [...roles],
          required: false,
          defaultValue: "player",
          // Never settable from sign-up or update-user; admins are promoted in the database.
          input: false,
        },
        adultConfirmedAt: {
          type: "date",
          required: false,
          // Set by POST /me/adult-confirmation, never from sign-up or update-user.
          input: false,
        },
      },
    },
    trustedOrigins: apple ? [...options.trustedOrigins, appleOrigin] : [...options.trustedOrigins],
    plugins: [expo()],
  });
};

export type Auth = ReturnType<typeof makeAuth>;
