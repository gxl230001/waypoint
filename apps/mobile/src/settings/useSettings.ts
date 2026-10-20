import { useCallback, useSyncExternalStore } from "react";
import type { Settings } from "./settingsModel";
import { getSettings, subscribeSettings, updateSettings } from "./settingsStore";

export function useSettings(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
} {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return { settings, update };
}
