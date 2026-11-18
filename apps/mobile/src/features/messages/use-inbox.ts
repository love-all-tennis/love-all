import type { Conversation } from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { mergeById } from "../forum/forum";
import { fetchInbox } from "./messages-api";
import { setUnreadConversations } from "./unread-store";

type Inbox = {
  readonly status: "ready" | "error";
  readonly items: ReadonlyArray<Conversation>;
  readonly cursor: string | null;
};

/**
 * My conversations, a page at a time. Reloads the first page on focus and
 * when the app comes back to the foreground, so new messages show up.
 */
export function useInbox() {
  const [state, setState] = useState<Inbox | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    fetchInbox()
      .then((page) => {
        if (mine !== generation.current) {
          return;
        }
        setUnreadConversations(page.unreadConversations);
        setState({ status: "ready", items: page.items, cursor: page.nextCursor });
      })
      .catch(() => {
        if (mine !== generation.current) {
          return;
        }
        // Keep what's up; only show the error when there's nothing to show.
        setState((s) => (s?.status === "ready" ? s : { status: "error", items: [], cursor: null }));
      });
  }, []);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (!state || state.status !== "ready" || !state.cursor || loadingMore) {
      return;
    }
    const mine = generation.current;
    setLoadingMore(true);
    fetchInbox(state.cursor)
      .then((page) => {
        if (mine !== generation.current) {
          return;
        }
        setState((s) =>
          s ? { ...s, items: mergeById(s.items, page.items), cursor: page.nextCursor } : s,
        );
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [state, loadingMore]);

  return {
    status: state?.status ?? ("loading" as const),
    items: state?.items ?? [],
    loadingMore,
    loadMore,
    refresh,
  };
}

/**
 * Keeps the tab badge current while the app is open: loads the unread count
 * once, and again whenever the app returns to the foreground.
 */
export function useUnreadBadgeSync() {
  useEffect(() => {
    const load = () =>
      fetchInbox()
        .then((page) => setUnreadConversations(page.unreadConversations))
        .catch(() => undefined);
    void load();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void load();
      }
    });
    return () => sub.remove();
  }, []);
}
