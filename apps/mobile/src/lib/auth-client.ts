import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { apiUrl } from "./config";

/** Better Auth on the device: the session lives in the secure store. */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    expoClient({
      scheme: "loveall",
      storagePrefix: "loveall",
      storage: SecureStore,
    }),
  ],
});
