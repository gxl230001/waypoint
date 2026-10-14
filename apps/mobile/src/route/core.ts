import type { Leg, Route } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Angle deviation in degrees from the current leg heading to trigger turn detection. */
export const TURN_START_DEG = 40;

/** Maximum angle deviation in degrees to consider heading stabilized after a turn. */
export const TURN_STABLE_DEG = 15;

/** Minimum steps with stable heading to confirm turn completion. */
export const STABLE_STEPS = 2;

/** Minimum time in ms with stable heading to confirm turn completion. */
export const STABLE_TIME_MS = 1500;

/** Minimum steps for a valid leg; shorter legs are merged into their neighbor. */
export const MIN_LEG_STEPS = 3;

/** Veer warning angle threshold in degrees. */
export const VEER_THRESHOLD_DEG = 25;

/** Heading alignment threshold in degrees to consider the next leg aligned. */
export const NEXT_LEG_ALIGNMENT_DEG = 20;

// ============================================================================
// Angle Math Helpers
// ============================================================================

/**
 * Normalizes an angle in degrees into [0, 360).
 */
export function normalizeDeg(deg: number): number {
  const mod = deg % 360;
  const result = mod < 0 ? mod + 360 : mod;
  return Math.abs(result - 360) < 1e-9 ? 0 : result;
}

/**
 * Calculates the shortest signed angle delta from `fromDeg` to `toDeg`.
 * Returns a value in [-180, 180), where positive is right (clockwise)
 * and negative is left (counter-clockwise).
 *
 * Example: 350 to 10 -> +20. 10 to 350 -> -20.
 */
export function signedAngleDelta(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

/**
 * Computes the circular mean of a set of angles in degrees, optionally weighted.
 * Returns the mean angle in [0, 360).
 */
export function circularMean(
  angles: readonly number[],
  weights?: readonly number[]
): number {
  if (angles.length === 0) return 0;

  let sumSin = 0;
  let sumCos = 0;

  for (let i = 0; i < angles.length; i++) {
    const rad = (angles[i] * Math.PI) / 180;
    const w = weights && weights[i] !== undefined ? weights[i] : 1;
    sumSin += Math.sin(rad) * w;
    sumCos += Math.cos(rad) * w;
  }

  if (Math.abs(sumSin) < 1e-9 && Math.abs(sumCos) < 1e-9) {
    return normalizeDeg(angles[0]);
  }

  const meanRad = Math.atan2(sumSin, sumCos);
  return normalizeDeg((meanRad * 180) / Math.PI);
}

// ============================================================================
// Instruction Wording
// ============================================================================

export type TurnDirection =
  | "straight"
  | "slight right"
  | "slight left"
  | "right"
  | "left"
  | "turn around";

/**
 * Converts a signed angle delta into a human-friendly turn direction.
 * - under 20: "straight"
 * - 20-60: "slight right" / "slight left"
 * - 60-150: "right" / "left"
 * - over 150: "turn around"
 */
export function formatTurnDirection(signedDeltaDeg: number): TurnDirection {
  const abs = Math.abs(signedDeltaDeg);
  if (abs < 20) return "straight";
  if (abs > 150) return "turn around";
  if (abs <= 60) {
    return signedDeltaDeg > 0 ? "slight right" : "slight left";
  }
  return signedDeltaDeg > 0 ? "right" : "left";
}

/**
 * Generates the spoken announcement on leg start.
 * Example: "Walk straight, 25 steps" or "Walk straight, 25 steps towards elevator"
 */
export function formatLegStartInstruction(leg: Leg): string {
  if (leg.label && leg.label.trim().length > 0) {
    return `Walk straight, ${leg.steps} steps towards ${leg.label.trim()}`;
  }
  return `Walk straight, ${leg.steps} steps`;
}

/**
 * Generates turn countdown instruction.
 * e.g. "Turn left in 5 steps", "Turn right now"
 */
export function formatTurnCueText(
  remainingSteps: number,
  turnAfterDeg: number | null
): string | null {
  if (turnAfterDeg === null) {
    if (remainingSteps === 0) return "You have arrived";
    return null;
  }

  const dir = formatTurnDirection(turnAfterDeg);
  if (dir === "straight") return null;

  if (remainingSteps === 5) {
    return dir === "turn around"
      ? "Turn around in 5 steps"
      : `Turn ${dir} in 5 steps`;
  }
  if (remainingSteps === 0) {
    return dir === "turn around"
      ? "Turn around now"
      : `Turn ${dir} now`;
  }
  return null;
}

/**
 * Generates milestone announcements (halfway, 10, 3 remaining).
 */
export function formatMilestoneCueText(
  remainingSteps: number,
  totalLegSteps: number
): string | null {
  if (remainingSteps <= 0) return null;

  const halfway = Math.floor(totalLegSteps / 2);
  if (
    remainingSteps === halfway &&
    totalLegSteps > 12 &&
    halfway !== 10 &&
    halfway !== 5 &&
    halfway !== 3
  ) {
    return `${remainingSteps} steps remaining`;
  }

  if (remainingSteps === 10 || remainingSteps === 3) {
    return `${remainingSteps} steps remaining`;
  }

  return null;
}

/**
 * Generates veer correction instruction if current heading deviates > 25° from leg heading.
 * Direction spoken is the corrective action (e.g. if drifting right, say "Veer left").
 */
export function checkVeerCue(
  legHeadingDeg: number,
  currentHeadingDeg: number
): { text: string; deltaDeg: number } | null {
  const delta = signedAngleDelta(currentHeadingDeg, legHeadingDeg);
  if (Math.abs(delta) > VEER_THRESHOLD_DEG) {
    return {
      text: delta > 0 ? "Veer right" : "Veer left",
      deltaDeg: delta,
    };
  }
  return null;
}

// ============================================================================
// Leg Segmentation & Merging
// ============================================================================

/**
 * Merges legs shorter than `minSteps` into their neighboring leg.
 */
export function mergeShortLegs(
  legs: readonly Leg[],
  minSteps = MIN_LEG_STEPS
): Leg[] {
  if (legs.length <= 1) return [...legs];

  let result: Leg[] = legs.map((l) => ({ ...l }));
  let changed = true;

  while (changed && result.length > 1) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      if (result[i].steps < minSteps) {
        if (i > 0) {
          // Merge into previous leg
          const prev = result[i - 1];
          const curr = result[i];
          const combinedSteps = prev.steps + curr.steps;
          // Weighted circular mean heading
          const mergedHeading = circularMean(
            [prev.headingDeg, curr.headingDeg],
            [prev.steps, curr.steps]
          );

          result[i - 1] = {
            steps: combinedSteps,
            headingDeg: Math.round(mergedHeading),
            turnAfterDeg: curr.turnAfterDeg,
            label: prev.label || curr.label,
          };
          result.splice(i, 1);
          changed = true;
          break;
        } else if (result.length > 1) {
          // Merge first leg into following leg
          const curr = result[0];
          const next = result[1];
          const combinedSteps = curr.steps + next.steps;
          const mergedHeading = circularMean(
            [curr.headingDeg, next.headingDeg],
            [curr.steps, next.steps]
          );

          result[1] = {
            steps: combinedSteps,
            headingDeg: Math.round(mergedHeading),
            turnAfterDeg: next.turnAfterDeg,
            label: curr.label || next.label,
          };
          result.shift();
          changed = true;
          break;
        }
      }
    }
  }

  // Ensure last leg has turnAfterDeg = null
  if (result.length > 0) {
    result[result.length - 1].turnAfterDeg = null;
  }

  return result;
}

interface HeadingSample {
  heading: number;
  steps: number;
}

/**
 * State machine for recording and segmenting a walk into legs.
 */
export class RouteSegmenter {
  private legs: Leg[] = [];
  private currentLegSteps = 0;
  private currentLegSamples: HeadingSample[] = [];
  private currentLabel?: string;

  private isTurning = false;
  private turnSamples: HeadingSample[] = [];
  private stableSteps = 0;
  private stableStartMs = 0;
  private lastStableHeading = 0;

  /**
   * Records a batch of steps at a given heading and timestamp.
   */
  addStep(stepsDelta: number, headingDeg: number, timestampMs = 0): void {
    if (stepsDelta <= 0) return;

    const normHeading = normalizeDeg(headingDeg);

    if (this.currentLegSamples.length === 0) {
      // First step of the first leg
      this.currentLegSteps = stepsDelta;
      this.currentLegSamples.push({ heading: normHeading, steps: stepsDelta });
      return;
    }

    const currentLegHeading = this.getCurrentLegHeading();

    if (!this.isTurning) {
      const dev = Math.abs(signedAngleDelta(currentLegHeading, normHeading));
      if (dev <= TURN_START_DEG) {
        // Continue walking straight
        this.currentLegSteps += stepsDelta;
        this.currentLegSamples.push({ heading: normHeading, steps: stepsDelta });
      } else {
        // Turn begins!
        this.isTurning = true;
        this.turnSamples = [{ heading: normHeading, steps: stepsDelta }];
        this.stableSteps = stepsDelta;
        this.stableStartMs = timestampMs;
        this.lastStableHeading = normHeading;
      }
    } else {
      // Currently in turn detection
      const devFromStable = Math.abs(
        signedAngleDelta(this.lastStableHeading, normHeading)
      );

      if (devFromStable <= TURN_STABLE_DEG) {
        this.turnSamples.push({ heading: normHeading, steps: stepsDelta });
        this.stableSteps += stepsDelta;
        const candidateMean = circularMean(
          this.turnSamples.map((s) => s.heading),
          this.turnSamples.map((s) => s.steps)
        );
        this.lastStableHeading = candidateMean;

        const isTimeStable =
          timestampMs > 0 &&
          this.stableStartMs > 0 &&
          timestampMs - this.stableStartMs >= STABLE_TIME_MS;

        if (this.stableSteps >= STABLE_STEPS || isTimeStable) {
          // Turn completed! Close previous leg
          const closedHeading = Math.round(this.getCurrentLegHeading());
          const newHeading = Math.round(candidateMean);
          const turnAfterDeg = Math.round(
            signedAngleDelta(closedHeading, newHeading)
          );

          this.legs.push({
            steps: this.currentLegSteps,
            headingDeg: closedHeading,
            turnAfterDeg,
            label: this.currentLabel,
          });

          // Start new leg with candidate turn samples
          this.currentLegSteps = this.stableSteps;
          this.currentLegSamples = [...this.turnSamples];
          this.currentLabel = undefined;
          this.isTurning = false;
          this.turnSamples = [];
          this.stableSteps = 0;
        }
      } else {
        // Heading shifted again; reset stabilization window
        this.turnSamples = [{ heading: normHeading, steps: stepsDelta }];
        this.stableSteps = stepsDelta;
        this.stableStartMs = timestampMs;
        this.lastStableHeading = normHeading;
      }
    }
  }

  /**
   * Manually marks a turn boundary, using the current heading vs leg heading.
   */
  markTurn(currentHeadingDeg?: number): void {
    if (this.currentLegSteps === 0 && this.currentLegSamples.length === 0) return;

    const closedHeading = Math.round(this.getCurrentLegHeading());
    const nextHeading =
      currentHeadingDeg !== undefined
        ? Math.round(normalizeDeg(currentHeadingDeg))
        : closedHeading;
    const turnAfterDeg = Math.round(
      signedAngleDelta(closedHeading, nextHeading)
    );

    this.legs.push({
      steps: this.currentLegSteps + (this.isTurning ? this.stableSteps : 0),
      headingDeg: closedHeading,
      turnAfterDeg,
      label: this.currentLabel,
    });

    this.currentLegSteps = 0;
    this.currentLegSamples =
      currentHeadingDeg !== undefined
        ? [{ heading: nextHeading, steps: 0 }]
        : [];
    this.currentLabel = undefined;
    this.isTurning = false;
    this.turnSamples = [];
    this.stableSteps = 0;
  }

  /**
   * Attaches a landmark label to the current leg.
   */
  markLandmark(label: string): void {
    this.currentLabel = label;
  }

  /**
   * Finalizes the route recording and returns merged legs and total steps.
   */
  finish(): { legs: Leg[]; totalSteps: number } {
    if (this.currentLegSteps > 0 || this.isTurning) {
      const extraSteps = this.isTurning ? this.stableSteps : 0;
      const closedHeading = Math.round(this.getCurrentLegHeading());
      this.legs.push({
        steps: this.currentLegSteps + extraSteps,
        headingDeg: closedHeading,
        turnAfterDeg: null,
        label: this.currentLabel,
      });
    }

    const merged = mergeShortLegs(this.legs);
    if (merged.length > 0) {
      merged[merged.length - 1].turnAfterDeg = null;
    }

    const totalSteps = merged.reduce((sum, l) => sum + l.steps, 0);
    return { legs: merged, totalSteps };
  }

  private getCurrentLegHeading(): number {
    if (this.currentLegSamples.length === 0) return 0;
    return circularMean(
      this.currentLegSamples.map((s) => s.heading),
      this.currentLegSamples.map((s) => s.steps)
    );
  }
}
