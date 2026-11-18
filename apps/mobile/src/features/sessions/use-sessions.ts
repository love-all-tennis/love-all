import type { Session, SessionScope, SessionSummary } from "@love-all/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchSession, listSessions } from "./sessions-api";

export type SessionList = {
  readonly sessions: ReadonlyArray<SessionSummary>;
  /** "loading" covers the first page only; a refresh keeps the old list up. */
  readonly status: "loading" | "ready" | "needsHomePoint" | "error";
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly refresh: () => void;
};

type ListState = {
  readonly status: "ready" | "needsHomePoint" | "error";
  readonly sessions: ReadonlyArray<SessionSummary>;
  readonly cursor: string | null;
};

/**
 * One scope of `GET /sessions`, a page at a time. Reloads the first page
 * whenever the screen comes back into focus, so a session created, edited
 * or answered elsewhere shows up.
 */
export function useSessionList(scope: SessionScope): SessionList {
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped on every first-page load, so a stale page never lands.
  const generation = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++generation.current;
    listSessions(scope)
      .then((result) => {
        if (mine !== generation.current) {
          return;
        }
        setState(
          result.kind === "needsHomePoint"
            ? { status: "needsHomePoint", sessions: [], cursor: null }
            : { status: "ready", sessions: result.page.items, cursor: result.page.nextCursor },
        );
      })
      .catch(() => {
        if (mine !== generation.current) {
          return;
        }
        // Keep a list that's already up; only show the error when there's nothing to show.
        setState((s) =>
          s?.status === "ready" ? s : { status: "error", sessions: [], cursor: null },
        );
      });
  }, [scope]);

  useFocusEffect(refresh);

  const loadMore = useCallback(() => {
    if (!state || state.status !== "ready" || !state.cursor || loadingMore) {
      return;
    }
    const mine = generation.current;
    setLoadingMore(true);
    listSessions(scope, state.cursor)
      .then((result) => {
        if (mine !== generation.current || result.kind !== "page") {
          return;
        }
        setState((s) => {
          if (!s) {
            return s;
          }
          const seen = new Set(s.sessions.map((x) => x.id));
          return {
            ...s,
            sessions: [...s.sessions, ...result.page.items.filter((x) => !seen.has(x.id))],
            cursor: result.page.nextCursor,
          };
        });
      })
      // A failed next page leaves the list as it was; scrolling again retries.
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [scope, state, loadingMore]);

  return {
    sessions: state?.sessions ?? [],
    status: state?.status ?? "loading",
    loadingMore,
    hasMore: state?.cursor != null,
    loadMore,
    refresh,
  };
}

export type SessionDetail =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly session: Session };

export type SessionDetailHandle = {
  readonly state: SessionDetail;
  readonly reload: () => void;
  readonly replace: (session: Session) => void;
};

/**
 * One session with its players. Reloads on focus (after editing or inviting)
 * and on `reload()`, keeping the loaded session up while it does. `replace`
 * puts in a session an action already returned, with no extra request.
 */
export function useSessionDetail(id: string): SessionDetailHandle {
  const [loaded, setLoaded] = useState<{ id: string; state: SessionDetail } | null>(null);
  const generation = useRef(0);

  const reload = useCallback(() => {
    const mine = ++generation.current;
    const settle = (state: SessionDetail) => {
      if (mine === generation.current) {
        setLoaded({ id, state });
      }
    };
    fetchSession(id)
      .then((session) => settle(session ? { kind: "ready", session } : { kind: "missing" }))
      .catch(() =>
        setLoaded((l) =>
          mine !== generation.current || (l?.id === id && l.state.kind === "ready")
            ? l
            : { id, state: { kind: "error" } },
        ),
      );
  }, [id]);

  useFocusEffect(reload);

  const replace = useCallback(
    (session: Session) => {
      generation.current++;
      setLoaded({ id, state: { kind: "ready", session } });
    },
    [id],
  );

  return { state: loaded?.id === id ? loaded.state : { kind: "loading" }, reload, replace };
}

/**
 * The time a screen compares sessions against (past, editable, today), taken
 * when it mounts and again each time it comes back into focus.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  return now;
}
