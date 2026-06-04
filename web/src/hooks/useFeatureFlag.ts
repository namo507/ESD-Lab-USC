import { FEATURE_FLAGS, type FeatureFlag } from "@/config/featureFlags";

function enabledByEnv(flag: FeatureFlag): boolean {
  const all = import.meta.env.VITE_NANO_FEATURES;
  if (all === "all" || all === "true") return true;
  return import.meta.env[`VITE_FEATURE_${flag}`] === "true";
}

export function isFeatureFlagEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag] || enabledByEnv(flag);
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  return isFeatureFlagEnabled(flag);
}
