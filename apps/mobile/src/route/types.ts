export interface Leg {
  /** Number of steps walked in this leg. */
  steps: number;
  /** Compass heading in degrees (circular mean, 0-360). */
  headingDeg: number;
  /**
   * Turn angle following this leg in degrees (signed, -180..180, positive = right).
   * Null on the final leg.
   */
  turnAfterDeg: number | null;
  /** Optional landmark text label spoken on replay (e.g. "elevator"). */
  label?: string;
}

export interface Route {
  id: string;
  name: string;
  /** ISO 8601 timestamp string when the route was recorded. */
  createdAt: string;
  version: 1;
  legs: Leg[];
  totalSteps: number;
  notes?: string;
}

export type SaveRouteResult =
  | { ok: true; route: Route }
  | { ok: false; error: string };

export type HapticType = "none" | "single" | "double";

export type CuePriority = "normal" | "high";

export interface Cue {
  text: string;
  haptic: HapticType;
  priority: CuePriority;
}

export interface Point2D {
  x: number;
  y: number;
}
