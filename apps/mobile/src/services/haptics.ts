import * as Haptics from "expo-haptics";
import { playCue, type HapticCue, type HapticDriver } from "./hapticPatterns";

const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
} as const;

const NOTIFICATION = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;

const driver: HapticDriver = {
  impact: (strength) => Haptics.impactAsync(IMPACT[strength]),
  notify: (type) => Haptics.notificationAsync(NOTIFICATION[type]),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let enabled = true;
let playId = 0;

/** Lets settings turn haptics off without this file importing them. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Plays a cue. A newer cue interrupts one that is still playing. */
export function cue(name: HapticCue): void {
  if (!enabled) return;
  playId += 1;
  const id = playId;
  void playCue(name, driver, () => id === playId);
}
