import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { getItem, getItemAsync, setItem, setItemAsync } from "expo-secure-store";
import { apiUrl } from "./config";

/** Better Auth on the device: the session lives in the secure store. */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: "loveall",
      storagePrefix: "loveall",
      storage: { getItem, getItemAsync, setItem, setItemAsync },
    }),
    // Mirrors `user.additionalFields` in apps/api/src/auth.ts.
    inferAdditionalFields({
      user: {
        role: { type: "string", required: false, input: false },
        adultConfirmedAt: { type: "date", required: false, input: false },
      },
    }),
  ],
});

export type SocialProvider = "google" | "apple";
