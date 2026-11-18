import type {
  EquipmentDetail,
  EquipmentKind,
  EquipmentReview,
  EquipmentSummary,
} from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchCatalog, fetchItem, fetchReviews } from "./gear-api";
import { mergeById } from "./gear";

type Paged<T> = {
  readonly status: "loading" | "ready" | "error";
  readonly items: ReadonlyArray<T>;
  readonly cursor: string | null;
};

const SEARCH_DELAY_MS = 300;

/**
 * The catalog, filtered by kind and search text, a page at a time. Typing
 * waits a moment before searching. Reloads on focus, so ratings I just gave
 * show up.
 */
export function useCatalog(kind: EquipmentKind | null, q: string) {
  const [state, setState] = useState<Paged<EquipmentSummary>>({
    status: "loading",
    items: [],
    cursor: null,
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState(q);
  const generation = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), SEARCH_DELAY_MS);

    return () => clearTimeout(timer);
  }, [q]);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchCatalog({ kind, q: query })
      .then((page) => {
        if (mine !== generation.current) return;
        setState({ status: "ready", items: page.items, cursor: page.nextCursor });
      })
      .catch(() => {
        if (mine !== generation.current) return;
        setState((s) => (s.items.length > 0 ? s : { status: "error", items: [], cursor: null }));
      });
  }, [kind, query]);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    fetchCatalog({ kind, q: query, cursor: state.cursor })
      .then((page) => {
        if (mine !== generation.current) return;
        setState((s) => ({ ...s, items: mergeById(s.items, page.items), cursor: page.nextCursor }));
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [kind, query, state, loadingMore]);

  return { ...state, loadingMore, loadMore, refresh };
}

type ItemState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly item: EquipmentDetail;
      readonly reviews: ReadonlyArray<EquipmentReview>;
      readonly cursor: string | null;
    };

/** An item with its first page of reviews. Reloads on focus, after I write or edit mine. */
export function useItem(id: string) {
  const [state, setState] = useState<ItemState>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    Promise.all([fetchItem(id), fetchReviews(id)])
      .then(([item, reviews]) => {
        if (mine !== generation.current) return;
        setState(
          item && reviews
            ? { status: "ready", item, reviews: reviews.items, cursor: reviews.nextCursor }
            : { status: "missing" },
        );
      })
      .catch(() => {
        if (mine !== generation.current) return;
        setState((s) => (s.status === "ready" ? s : { status: "error" }));
      });
  }, [id]);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (state.status !== "ready" || !state.cursor || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    fetchReviews(id, state.cursor)
      .then((page) => {
        if (mine !== generation.current || !page) return;
        setState((s) =>
          s.status === "ready"
            ? { ...s, reviews: mergeById(s.reviews, page.items), cursor: page.nextCursor }
            : s,
        );
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [id, state, loadingMore]);

  return { state, loadingMore, loadMore, refresh };
}
