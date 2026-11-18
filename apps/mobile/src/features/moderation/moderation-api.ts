import type { HideableTargetType, ReportStatus } from "@love-all/domain";

import { callApi } from "@/lib/api";

/**
 * Moderation calls, for admins. The app only shows the moderation screen to
 * admins, so a refusal is unexpected: like a network failure, it rejects and
 * the screen says to try again.
 */
export const fetchReports = (status: ReportStatus, cursor?: string) =>
  callApi((api) => api.moderation.listReports({ query: cursor ? { status, cursor } : { status } }));

export const dismissReport = (id: string) =>
  callApi((api) => api.moderation.dismissReport({ params: { id } }));

export const setHidden = (type: HideableTargetType, id: string, hidden: boolean) =>
  callApi((api) =>
    hidden
      ? api.moderation.hideContent({ params: { type, id } })
      : api.moderation.unhideContent({ params: { type, id } }),
  );

export const setSuspended = (playerId: string, suspended: boolean) =>
  callApi((api) =>
    suspended
      ? api.moderation.suspend({ params: { id: playerId }, payload: {} })
      : api.moderation.unsuspend({ params: { id: playerId } }),
  );
