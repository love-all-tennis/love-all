import type { Me } from "@love-all/domain";

import { callApi } from "@/lib/api";
import { toAvailabilityBlocks, toProfileUpdate, type ProfileDraft } from "./draft";

export const fetchMe = (): Promise<Me> => callApi((api) => api.me.get());

/**
 * Saves the whole setup form: the profile first (the first save creates it),
 * then the weekly availability, which replaces whatever was there.
 */
export const saveProfile = async (draft: ProfileDraft): Promise<void> => {
  await callApi((api) => api.me.update({ payload: toProfileUpdate(draft) }));
  await callApi((api) =>
    api.me.replaceAvailability({ payload: toAvailabilityBlocks(draft.slots) }),
  );
};
