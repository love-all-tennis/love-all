import type { ForumCategory, ForumThreadSummary } from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchCategories, fetchThreads } from "./forum-api";
import { mergeById } from "./forum";

export type Loadable<A> =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly value: A };

/** The categories I can see. Reloads on focus, so new activity shows up. */
export function useCategories(): {
  readonly state: Loadable<ReadonlyArray<ForumCategory>>;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<Loadable<ReadonlyArray<ForumCategory>>>({
    status: "loading",
  });
  const generation = useRef(0);
  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchCategories()
      .then((value) => mine === generation.current && setState({ status: "ready", value }))
      // Keep what's up; only show the error when there's nothing to show.
      .catch(
        () =>
          mine === generation.current &&
          setState((s) => (s.status === "ready" ? s : { status: "error" })),
      );
  }, []);
  useFocusEffect(refresh);
  return { state, refresh };
}

type ThreadList = {
  readonly status: "ready" | "missing" | "error";
  readonly threads: ReadonlyArray<ForumThreadSummary>;
  readonly cursor: string | null;
};

/**
 * A category's threads, a page at a time. Reloads the first page on focus,
 * so a new thread or reply posted elsewhere moves up.
 */
export function useThreadList(categoryId: string) {
  const [state, setState] = useState<ThreadList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchThreads(categoryId)
      .then((page) => {
        if (mine !== generation.current) return;
        setState(
          page
            ? { status: "ready", threads: page.items, cursor: page.nextCursor }
            : { status: "missing", threads: [], cursor: null },
        );
      })
      .catch(() => {
        if (mine !== generation.current) return;
        setState((s) =>
          s?.status === "ready" ? s : { status: "error", threads: [], cursor: null },
        );
      });
  }, [categoryId]);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (!state || state.status !== "ready" || !state.cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    fetchThreads(categoryId, state.cursor)
      .then((page) => {
        if (mine !== generation.current || !page) return;
        setState((s) =>
          s ? { ...s, threads: mergeById(s.threads, page.items), cursor: page.nextCursor } : s,
        );
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [categoryId, state, loadingMore]);

  return {
    status: state?.status ?? ("loading" as const),
    threads: state?.threads ?? [],
    loadingMore,
    loadMore,
    refresh,
  };
}
