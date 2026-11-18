import type { NewReport, ReportReason, ReportTargetType } from "@love-all/domain";
import { Effect, type Types, Match } from "effect";

import { callApi } from "@/lib/api";

type Outcome = string | null;

const refusals = {
  TargetNotFound: () => Effect.succeed<Outcome>("This player is no longer available."),
  CannotTargetSelf: () => Effect.succeed<Outcome>("You can't do that to your own profile."),
};

/** Blocks a player. They disappear from search, follows and their profile for both of us. */
export const blockPlayer = (id: string) =>
  callApi((api) =>
    api.safety.block({ params: { id } }).pipe(Effect.as<Outcome>(null), Effect.catchTags(refusals)),
  );

const reportPayload = (
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string,
) => {
  const payload: Types.Mutable<NewReport> = { targetType, targetId, reason };

  const trimmed = details.trim();

  if (trimmed) payload.details = trimmed;

  return payload;
};

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
) =>
  callApi((api) =>
    api.safety
      .report({
        payload: reportPayload(targetType, targetId, reason, details),
      })
      .pipe(
        Effect.as<Outcome>(null),
        Effect.catchTags({
          TargetNotFound: () =>
            Effect.succeed<Outcome>(
              Match.value(targetType).pipe(
                Match.when("player", () => "This player is no longer available."),
                Match.when("direct_message", () => "This message is no longer available."),
                Match.when("equipment_review", () => "This review is no longer available."),
                Match.orElse(() => "This post is no longer available."),
              ),
            ),
          CannotTargetSelf: () =>
            Effect.succeed<Outcome>("You can't report yourself or your own posts."),
        }),
      ),
  );
