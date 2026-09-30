import type { Session } from "@supabase/supabase-js";
import { accountRpc, type AuthScope } from "../../state/AuthState";
import { parseAccountState, type AccountState } from "./model";

export async function getAccountState(scope: AuthScope, session: Session) {
  return parseAccountState(await accountRpc(scope, session, "rs_get_account_state"));
}
export async function putAccountState(scope: AuthScope, session: Session, value: AccountState) {
  return parseAccountState(await accountRpc(scope, session, "rs_update_account_state", {
    p_expected_revision: value.revision,
    p_onboarding_step: value.onboarding_step,
    p_location_choice: value.location_choice,
    p_preferences: value.preferences,
  }));
}
