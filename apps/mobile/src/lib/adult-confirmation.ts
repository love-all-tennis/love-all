import { callApi } from "./api";

/**
 * Set when the player ticks "I'm 18 or older" on the sign-up screen, so the
 * confirmation is sent as soon as their new session exists instead of asking
 * them a second time. Only lives in memory: if the app restarts first, the
 * confirm-age screen simply asks again.
 */
let confirmedOnSignUp = false;

export const rememberAdultConfirmation = (confirmed: boolean) => {
  confirmedOnSignUp = confirmed;
};

/** Whether the player already confirmed on the sign-up screen. Doesn't clear it. */
export const confirmedAdultOnSignUp = (): boolean => confirmedOnSignUp;

/** Records on the server that the signed-in player is 18 or older. */
export const confirmAdult = () => callApi((api) => api.me.confirmAdult());
