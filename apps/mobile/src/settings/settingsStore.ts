import { File, Paths } from "expo-file-system";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
} from "./settingsModel";

/**
 * Settings are one small JSON file in the app's document directory. They stay
 * on the device and are never uploaded.
 */
const FILE_NAME = "waypoint_settings.json";

type Listener = () => void;

let current: Settings = { ...DEFAULT_SETTINGS };
let loaded = false;
const listeners = new Set<Listener>();

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

function load(): void {
  loaded = true;
  try {
    const file = settingsFile();
    if (!file.exists) return;
    current = normalizeSettings(JSON.parse(file.textSync()));
  } catch (e) {
    // A missing or corrupt file just means defaults.
    console.warn("Could not read settings, using defaults:", e);
    current = { ...DEFAULT_SETTINGS };
  }
}

function persist(): void {
  try {
    const file = settingsFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(current, null, 2));
  } catch (e) {
    console.warn("Could not save settings:", e);
  }
}

/** Current settings. The first call reads the file from disk. */
export function getSettings(): Settings {
  if (!loaded) load();
  return current;
}

/** Merges a change, saves it, and notifies subscribers. */
export function updateSettings(patch: Partial<Settings>): void {
  if (!loaded) load();
  current = normalizeSettings({ ...current, ...patch });
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
