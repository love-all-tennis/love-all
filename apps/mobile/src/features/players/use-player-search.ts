import type { PlayerSummary } from "@love-all/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlayerFilters } from "./filters";
import { searchPlayers } from "./players-api";

export type PlayerSearch = {
  readonly players: ReadonlyArray<PlayerSummary>;
  /** "loading" covers the first page; `loadingMore` covers the pages after it. */
  readonly status: "loading" | "ready" | "needsHomePoint" | "error";
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly refresh: () => void;
};

/**
 * Nearby players for the given filters, a page at a time. Changing the
 * filters starts over from the first page; answers to older filters are
 * dropped, so a slow response never overwrites a newer one.
 */
export function usePlayerSearch(filters: PlayerFilters | null): PlayerSearch {
  const [players, setPlayers] = useState<ReadonlyArray<PlayerSummary>>([]);
  const [status, setStatus] = useState<PlayerSearch["status"]>("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [generation, setGeneration] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!filters) return;
    const request = ++latest.current;
    setStatus("loading");
    setPlayers([]);
    setCursor(null);
    setLoadingMore(false);
    searchPlayers(filters)
      .then((result) => {
        if (request !== latest.current) return;
        if (result.kind === "needsHomePoint") return setStatus("needsHomePoint");
        setPlayers(result.page.items);
        setCursor(result.page.nextCursor);
        setStatus("ready");
      })
      .catch(() => request === latest.current && setStatus("error"));
  }, [filters, generation]);

  const loadMore = useCallback(() => {
    if (!filters || !cursor || loadingMore || status !== "ready") return;
    const request = latest.current;
    setLoadingMore(true);
    searchPlayers(filters, cursor)
      .then((result) => {
        if (request !== latest.current || result.kind !== "page") return;
        // A player can move between pages if they change their profile meanwhile.
        setPlayers((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...result.page.items.filter((p) => !seen.has(p.id))];
        });
        setCursor(result.page.nextCursor);
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() => undefined)
      .finally(() => request === latest.current && setLoadingMore(false));
  }, [filters, cursor, loadingMore, status]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  return { players, status, loadingMore, hasMore: cursor !== null, loadMore, refresh };
}
