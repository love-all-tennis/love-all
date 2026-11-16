import type { ReportReason } from "@love-all/domain";
import { Effect } from "effect";

import { callApi } from "@/lib/api";

/** What went wrong, in words a player can act on, or null when it worked. */
type Outcome = string | null;

const refusals = {
  TargetNotFound: () => Effect.succeed<Outcome>("This player is no longer available."),
  CannotTargetSelf: () => Effect.succeed<Outcome>("You can't do that to your own profile."),
};

/** Blocks a player. They disappear from search, follows and their profile for both of us. */
export const blockPlayer = (id: string): Promise<Outcome> =>
  callApi((api) =>
    api.safety.block({ params: { id } }).pipe(Effect.as<Outcome>(null), Effect.catchTags(refusals)),
  );

/** Sends a report about a player to the moderators. It doesn't block them. */
export const reportPlayer = (id: string, reason: ReportReason, details: string): Promise<Outcome> =>
  callApi((api) =>
    api.safety
      .report({
        payload: {
          targetType: "player",
          targetId: id,
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
        },
      })
      .pipe(Effect.as<Outcome>(null), Effect.catchTags(refusals)),
  );
