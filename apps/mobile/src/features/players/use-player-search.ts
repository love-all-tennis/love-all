import type { PlayerSummary } from "@love-all/domain";
import { useCallback, useEffect, useState } from "react";

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

/** What came back for one set of filters (and one refresh). */
type Results = {
  readonly filters: PlayerFilters;
  readonly generation: number;
  readonly status: "ready" | "needsHomePoint" | "error";
  readonly players: ReadonlyArray<PlayerSummary>;
  readonly cursor: string | null;
  /** The cursor of the page being fetched now, if any. */
  readonly loadingCursor: string | null;
};

/**
 * Nearby players for the given filters, a page at a time. Changing the
 * filters starts over from the first page. Results are tagged with the
 * filters they answer, so a slow response for old filters is never shown.
 */
export function usePlayerSearch(filters: PlayerFilters | null): PlayerSearch {
  const [generation, setGeneration] = useState(0);
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    if (!filters) {
      return;
    }
    let live = true;
    const base = { filters, generation, loadingCursor: null };
    searchPlayers(filters)
      .then((result) => {
        if (!live) {
          return;
        }
        setResults(
          result.kind === "needsHomePoint"
            ? { ...base, status: "needsHomePoint", players: [], cursor: null }
            : {
                ...base,
                status: "ready",
                players: result.page.items,
                cursor: result.page.nextCursor,
              },
        );
      })
      .catch(() => live && setResults({ ...base, status: "error", players: [], cursor: null }));
    return () => {
      live = false;
    };
  }, [filters, generation]);

  const current =
    results && results.filters === filters && results.generation === generation ? results : null;

  const loadMore = useCallback(() => {
    if (!current || current.status !== "ready" || !current.cursor || current.loadingCursor) {
      return;
    }
    const cursor = current.cursor;
    const isSame = (r: Results | null): r is Results =>
      r !== null && r.filters === current.filters && r.generation === current.generation;
    setResults((r) => (isSame(r) ? { ...r, loadingCursor: cursor } : r));
    searchPlayers(current.filters, cursor)
      .then((result) => {
        setResults((r) => {
          if (!isSame(r) || r.loadingCursor !== cursor) {
            return r;
          }
          if (result.kind !== "page") {
            return { ...r, loadingCursor: null };
          }
          // A player can move between pages if they change their profile meanwhile.
          const seen = new Set(r.players.map((p) => p.id));
          return {
            ...r,
            players: [...r.players, ...result.page.items.filter((p) => !seen.has(p.id))],
            cursor: result.page.nextCursor,
            loadingCursor: null,
          };
        });
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() =>
        setResults((r) =>
          isSame(r) && r.loadingCursor === cursor ? { ...r, loadingCursor: null } : r,
        ),
      );
  }, [current]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);

  return {
    players: current?.players ?? [],
    status: current?.status ?? "loading",
    loadingMore: current?.loadingCursor != null,
    hasMore: current?.cursor != null,
    loadMore,
    refresh,
  };
}
