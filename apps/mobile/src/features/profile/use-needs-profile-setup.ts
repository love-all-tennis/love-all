import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { needsSetup } from "./draft";
import { fetchMe } from "./profile-api";

/**
 * True once we know the signed-in player hasn't finished profile setup.
 * Signed out, still loading, or the API unreachable all count as false, so
 * the app never traps someone in setup because of a network blip.
 */
export function useNeedsProfileSetup() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const [checked, setChecked] = useState<{ userId: string; needs: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchMe()
      .then((me) => live && setChecked({ userId, needs: needsSetup(me) }))
      .catch(() => live && setChecked({ userId, needs: false }));

    return () => {
      live = false;
    };
  }, [userId]);

  return userId !== undefined && checked?.userId === userId && checked.needs;
}
