import type { ReportReason, ReportTargetType } from "@love-all/domain";
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

/**
 * Sends a report to the moderators about a player (by account id) or
 * something they wrote (a forum thread or reply id, or a direct message id).
 * It doesn't block them.
 */
export const sendReport = (
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string,
): Promise<Outcome> =>
  callApi((api) =>
    api.safety
      .report({
        payload: {
          targetType,
          targetId,
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
        },
      })
      .pipe(
        Effect.as<Outcome>(null),
        Effect.catchTags({
          TargetNotFound: () =>
            Effect.succeed<Outcome>(
              targetType === "player"
                ? "This player is no longer available."
                : targetType === "direct_message"
                  ? "This message is no longer available."
                  : "This post is no longer available.",
            ),
          CannotTargetSelf: () =>
            Effect.succeed<Outcome>("You can't report yourself or your own posts."),
        }),
      ),
  );
