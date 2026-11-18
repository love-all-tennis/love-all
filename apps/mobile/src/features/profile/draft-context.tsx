import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { draftFromMe, emptyDraft, type ProfileDraft } from "./draft";
import { fetchMe, saveProfile } from "./profile-api";

type DraftState = {
  draft: ProfileDraft;
  update: (patch: Partial<ProfileDraft>) => void;
  replace: (draft: ProfileDraft) => void;
  /** True until the saved profile (if any) has been loaded into the form. */
  loading: boolean;
  save: () => Promise<void>;
};

const DraftContext = createContext<DraftState | null>(null);

/** Holds the setup form across its screens, starting from what's already saved. */
export function ProfileDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((me) => live && setDraft(draftFromMe(me)))
      // Can't load: start blank, and the save at the end will report the problem.
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const value: DraftState = {
    draft,
    update: (patch) => setDraft((d) => ({ ...d, ...patch })),
    replace: setDraft,
    loading,
    save: () => saveProfile(draft),
  };
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useProfileDraft(): DraftState {
  const state = useContext(DraftContext);
  if (!state) {
    throw new Error("useProfileDraft must be used inside ProfileDraftProvider");
  }
  return state;
}
