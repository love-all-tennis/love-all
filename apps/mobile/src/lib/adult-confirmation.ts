import { callApi } from "./api";

let confirmedOnSignUp = false;

export const rememberAdultConfirmation = (confirmed: boolean) => {
  confirmedOnSignUp = confirmed;
};

/** Whether the player already confirmed on the sign-up screen. Doesn't clear it. */
export const confirmedAdultOnSignUp = () => confirmedOnSignUp;

/** Records on the server that the signed-in player is 18 or older. */
export const confirmAdult = () => callApi((api) => api.me.confirmAdult());
