export const onboardingSteps = ["language", "location", "profile", "vehicle", "complete"] as const;
export type OnboardingStep = typeof onboardingSteps[number];
export type AccountPreferences = {
  ghost_mode: boolean;
  route_audience: "friends" | "private";
  notifications_enabled: boolean;
};
export type AccountState = {
  revision: number;
  onboarding_version: number;
  onboarding_step: OnboardingStep;
  location_choice: "unknown" | "granted" | "denied";
  preferences: AccountPreferences;
};
export type OnboardingDraft = AccountState & { pending: boolean };

export function initialAccountState(): AccountState {
  return { revision: 0, onboarding_version: 1, onboarding_step: "language", location_choice: "unknown", preferences: { ghost_mode: true, route_audience: "friends", notifications_enabled: false } };
}
export function parseAccountState(value: unknown): AccountState {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 0 || !onboardingSteps.includes(raw.onboarding_step as OnboardingStep) || !Number.isSafeInteger(raw.onboarding_version) || (raw.onboarding_version as number) < 1) throw new Error("ACCOUNT_STATE_INVALID");
  const preferences = raw.preferences && typeof raw.preferences === "object" ? raw.preferences as Record<string, unknown> : {};
  return {
    revision: raw.revision as number,
    onboarding_version: raw.onboarding_version as number,
    onboarding_step: raw.onboarding_step as OnboardingStep,
    location_choice: raw.location_choice === "granted" || raw.location_choice === "denied" ? raw.location_choice : "unknown",
    preferences: { ghost_mode: preferences.ghost_mode !== false, route_audience: preferences.route_audience === "private" ? "private" : "friends", notifications_enabled: preferences.notifications_enabled === true },
  };
}
export function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value ? { ...parseAccountState(value), pending: value.pending === true } : null;
  } catch { return null; }
}
export function mergeOnboardingState(local: OnboardingDraft | null, remote: AccountState): OnboardingDraft {
  const localAhead = local && onboardingSteps.indexOf(local.onboarding_step) > onboardingSteps.indexOf(remote.onboarding_step);
  if (!localAhead) return { ...remote, pending: false };
  return { ...local, revision: remote.revision, preferences: remote.preferences, pending: true };
}
export function validateRiderName(displayName: string, handle: string): { displayName: string; handle: string; error?: never } | { error: "name" | "handle" } {
  const name = displayName.trim(), username = handle.trim().toLowerCase();
  if (!name || name.length > 40) return { error: "name" };
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return { error: "handle" };
  return { displayName: name, handle: username };
}
