import type { ModerationReport, ReportStatus } from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchReports } from "./moderation-api";

type ReportList = {
  readonly status: "ready" | "error";
  readonly reports: ReadonlyArray<ModerationReport>;
  readonly cursor: string | null;
};

/** The reports queue for one status, loading more as I scroll. Refreshes on focus. */
export function useReports(status: ReportStatus) {
  const [state, setState] = useState<ReportList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchReports(status)
      .then((page) => {
        if (mine !== generation.current) {
          return;
        }
        setState({ status: "ready", reports: page.items, cursor: page.nextCursor });
      })
      .catch(() => {
        if (mine !== generation.current) {
          return;
        }
        setState((s) =>
          s?.status === "ready" ? s : { status: "error", reports: [], cursor: null },
        );
      });
  }, [status]);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (!state || state.status !== "ready" || !state.cursor || loadingMore) {
      return;
    }
    const mine = generation.current;
    setLoadingMore(true);
    fetchReports(status, state.cursor)
      .then((page) => {
        if (mine !== generation.current) {
          return;
        }
        setState((s) => {
          if (!s) {
            return s;
          }
          const seen = new Set(s.reports.map((r) => r.id));
          return {
            ...s,
            reports: [...s.reports, ...page.items.filter((r) => !seen.has(r.id))],
            cursor: page.nextCursor,
          };
        });
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [status, state, loadingMore]);

  return {
    status: state?.status ?? ("loading" as const),
    reports: state?.reports ?? [],
    loadingMore,
    loadMore,
    refresh,
  };
}
