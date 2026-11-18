import { authClient } from "./auth-client";
import { unregisterForPush } from "./push";

/** Signs out, first stopping push notifications to this phone for this account. */
export async function signOut(): Promise<void> {
  await unregisterForPush();
  await authClient.signOut();
}
