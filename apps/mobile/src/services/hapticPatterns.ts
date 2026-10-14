/**
 * Haptic cue library. Pure data and playback logic with no Expo imports, so it
 * can be unit tested in Node. The device binding lives in haptics.ts.
 *
 * Patterns are meant to be told apart by feel alone, so they differ in count,
 * strength and rhythm. Tune them here after testing with real users.
 */
export type HapticCue =
  | "left"
  | "right"
  | "straight"
  | "arrived"
  | "hazard"
  | "offRoute"
  | "confirm"
  | "warning";

export type HapticStep =
  | { kind: "impact"; strength: "light" | "medium" | "heavy" }
  | { kind: "notify"; type: "success" | "warning" | "error" }
  | { kind: "pause"; ms: number };

export const HAPTIC_PATTERNS: Record<HapticCue, readonly HapticStep[]> = {
  // Two quick light taps.
  left: [
    { kind: "impact", strength: "light" },
    { kind: "pause", ms: 120 },
    { kind: "impact", strength: "light" },
  ],
  // One firm tap.
  right: [{ kind: "impact", strength: "heavy" }],
  // One medium tap.
  straight: [{ kind: "impact", strength: "medium" }],
  arrived: [{ kind: "notify", type: "success" }],
  // Three rapid heavy taps.
  hazard: [
    { kind: "impact", strength: "heavy" },
    { kind: "pause", ms: 80 },
    { kind: "impact", strength: "heavy" },
    { kind: "pause", ms: 80 },
    { kind: "impact", strength: "heavy" },
  ],
  offRoute: [
    { kind: "notify", type: "warning" },
    { kind: "pause", ms: 200 },
    { kind: "impact", strength: "medium" },
  ],
  confirm: [{ kind: "notify", type: "success" }],
  warning: [{ kind: "notify", type: "warning" }],
};

export type HapticDriver = {
  impact(strength: "light" | "medium" | "heavy"): Promise<void> | void;
  notify(type: "success" | "warning" | "error"): Promise<void> | void;
  wait(ms: number): Promise<void>;
};

/**
 * Plays one cue. Stops early if shouldContinue() turns false, which is how a
 * newer cue replaces one that is still playing. Never throws: a haptic that
 * fails must not break navigation.
 */
export async function playCue(
  cue: HapticCue,
  driver: HapticDriver,
  shouldContinue: () => boolean = () => true
): Promise<void> {
  for (const step of HAPTIC_PATTERNS[cue]) {
    if (!shouldContinue()) return;
    try {
      if (step.kind === "impact") await driver.impact(step.strength);
      else if (step.kind === "notify") await driver.notify(step.type);
      else await driver.wait(step.ms);
    } catch {
      return;
    }
  }
}
