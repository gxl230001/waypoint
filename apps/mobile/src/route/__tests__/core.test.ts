// Run from apps/mobile:  npx tsx --test src/route/__tests__/core.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  checkVeerCue,
  circularMean,
  formatLegStartInstruction,
  formatMilestoneCueText,
  formatTurnCueText,
  formatTurnDirection,
  mergeShortLegs,
  normalizeDeg,
  RouteSegmenter,
  signedAngleDelta,
  TURN_START_DEG,
  TURN_STABLE_DEG,
} from "../core";
import type { Leg } from "../types";

test("normalizeDeg normalizes angles to [0, 360)", () => {
  assert.equal(normalizeDeg(0), 0);
  assert.equal(normalizeDeg(360), 0);
  assert.equal(normalizeDeg(370), 10);
  assert.equal(normalizeDeg(-10), 350);
  assert.equal(normalizeDeg(-370), 350);
});

test("signedAngleDelta computes signed shortest turn [-180, 180)", () => {
  assert.equal(signedAngleDelta(0, 90), 90);
  assert.equal(signedAngleDelta(90, 0), -90);
  assert.equal(signedAngleDelta(90, 180), 90);
  assert.equal(signedAngleDelta(180, 90), -90);

  // Wraparound cases: 350 to 10 is +20, 10 to 350 is -20
  assert.equal(signedAngleDelta(350, 10), 20);
  assert.equal(signedAngleDelta(10, 350), -20);
  assert.equal(signedAngleDelta(355, 5), 10);
  assert.equal(signedAngleDelta(5, 355), -10);
});

test("circularMean computes average angle across 0/360 boundary", () => {
  assert.equal(circularMean([]), 0);
  assert.equal(Math.round(circularMean([350, 10])), 0);
  assert.equal(Math.round(circularMean([80, 100])), 90);
  assert.equal(Math.round(circularMean([10, 20, 30])), 20);

  // Weighted circular mean
  const weighted = circularMean([0, 90], [3, 1]);
  assert.ok(weighted < 30 && weighted > 15);
});

test("formatTurnDirection handles under 20, 20-60, 60-150, over 150", () => {
  assert.equal(formatTurnDirection(0), "straight");
  assert.equal(formatTurnDirection(15), "straight");
  assert.equal(formatTurnDirection(-19), "straight");

  assert.equal(formatTurnDirection(20), "slight right");
  assert.equal(formatTurnDirection(60), "slight right");
  assert.equal(formatTurnDirection(-45), "slight left");

  assert.equal(formatTurnDirection(90), "right");
  assert.equal(formatTurnDirection(140), "right");
  assert.equal(formatTurnDirection(-90), "left");

  assert.equal(formatTurnDirection(160), "turn around");
  assert.equal(formatTurnDirection(-175), "turn around");
});

test("formatLegStartInstruction includes landmark label if present", () => {
  const plainLeg: Leg = { steps: 25, headingDeg: 0, turnAfterDeg: 90 };
  assert.equal(formatLegStartInstruction(plainLeg), "Walk straight, 25 steps");

  const landmarkLeg: Leg = {
    steps: 15,
    headingDeg: 90,
    turnAfterDeg: null,
    label: "elevator",
  };
  assert.equal(
    formatLegStartInstruction(landmarkLeg),
    "Walk straight, 15 steps towards elevator"
  );
});

test("formatTurnCueText provides countdown and arrival cues", () => {
  assert.equal(formatTurnCueText(5, 90), "Turn right in 5 steps");
  assert.equal(formatTurnCueText(0, 90), "Turn right now");
  assert.equal(formatTurnCueText(5, -45), "Turn slight left in 5 steps");
  assert.equal(formatTurnCueText(0, -90), "Turn left now");
  assert.equal(formatTurnCueText(5, 170), "Turn around in 5 steps");
  assert.equal(formatTurnCueText(0, 170), "Turn around now");

  // On last leg (turnAfterDeg is null)
  assert.equal(formatTurnCueText(0, null), "You have arrived");
  assert.equal(formatTurnCueText(5, null), null);
});

test("formatMilestoneCueText announces milestones", () => {
  assert.equal(formatMilestoneCueText(10, 30), "10 steps remaining");
  assert.equal(formatMilestoneCueText(3, 30), "3 steps remaining");
  assert.equal(formatMilestoneCueText(15, 30), "15 steps remaining"); // halfway for total 30
  assert.equal(formatMilestoneCueText(7, 30), null);
});

test("checkVeerCue detects drift > 25 degrees and speaks corrective direction", () => {
  // Drifting right (current heading 30° when path is 0°): correction is "Veer left"
  const driftRight = checkVeerCue(0, 30);
  assert.ok(driftRight);
  assert.equal(driftRight.text, "Veer left");

  // Drifting left (current heading 330° (-30°) when path is 0°): correction is "Veer right"
  const driftLeft = checkVeerCue(0, 330);
  assert.ok(driftLeft);
  assert.equal(driftLeft.text, "Veer right");

  // Normal walking within 25 degrees: no veer cue
  assert.equal(checkVeerCue(0, 15), null);
  assert.equal(checkVeerCue(0, 345), null);
});

test("synthetic stream: 20 steps at 90°, turn right to 180°, 12 steps, turn left to 90°, 8 steps", () => {
  const segmenter = new RouteSegmenter();

  // 20 steps at 90 degrees
  for (let i = 0; i < 20; i++) {
    segmenter.addStep(1, 90, i * 500);
  }

  // Turn right to 180: takes 2 stable steps to confirm turn
  segmenter.addStep(1, 180, 20 * 500); // triggers turn
  segmenter.addStep(1, 180, 21 * 500); // 2nd step completes turn

  // 10 more steps at 180 (total 12 steps at 180)
  for (let i = 2; i < 12; i++) {
    segmenter.addStep(1, 180, (20 + i) * 500);
  }

  // Turn left to 90: takes 2 stable steps to confirm turn
  segmenter.addStep(1, 90, 32 * 500); // triggers turn
  segmenter.addStep(1, 90, 33 * 500); // 2nd step completes turn

  // 6 more steps at 90 (total 8 steps at 90)
  for (let i = 2; i < 8; i++) {
    segmenter.addStep(1, 90, (32 + i) * 500);
  }

  const { legs, totalSteps } = segmenter.finish();

  assert.equal(legs.length, 3, "Expected exactly 3 legs");
  assert.equal(totalSteps, 40, "Expected total 40 steps");

  // Leg 1: 20 steps at ~90°, turn right ~90°
  assert.equal(legs[0].steps, 20);
  assert.equal(legs[0].headingDeg, 90);
  assert.equal(legs[0].turnAfterDeg, 90);

  // Leg 2: 12 steps at ~180°, turn left ~ -90°
  assert.equal(legs[1].steps, 12);
  assert.equal(legs[1].headingDeg, 180);
  assert.equal(legs[1].turnAfterDeg, -90);

  // Leg 3: 8 steps at ~90°, arrival (null turnAfterDeg)
  assert.equal(legs[2].steps, 8);
  assert.equal(legs[2].headingDeg, 90);
  assert.equal(legs[2].turnAfterDeg, null);
});

test("batched step deltas segment correctly", () => {
  const segmenter = new RouteSegmenter();

  // Pedometer delivers batches of 5 steps
  segmenter.addStep(5, 90, 0);
  segmenter.addStep(5, 90, 500);
  segmenter.addStep(10, 90, 1000); // 20 steps total at 90

  // Turn to 180 in a single batch of 4 steps (>= STABLE_STEPS)
  segmenter.addStep(4, 180, 1500);
  segmenter.addStep(8, 180, 2000); // 12 steps total at 180

  const { legs, totalSteps } = segmenter.finish();

  assert.equal(legs.length, 2);
  assert.equal(totalSteps, 32);
  assert.equal(legs[0].steps, 20);
  assert.equal(legs[0].turnAfterDeg, 90);
  assert.equal(legs[1].steps, 12);
  assert.equal(legs[1].turnAfterDeg, null);
});

test("jitter within 10 degrees creates no false turn", () => {
  const segmenter = new RouteSegmenter();

  // 30 steps with heading jittering between 82° and 98° (within +/- 8°)
  for (let i = 0; i < 30; i++) {
    const jitterHeading = 90 + ((i % 5) - 2) * 4; // 82, 86, 90, 94, 98
    segmenter.addStep(1, jitterHeading, i * 400);
  }

  const { legs, totalSteps } = segmenter.finish();

  assert.equal(legs.length, 1, "Jitter within 10 degrees must not trigger turn");
  assert.equal(totalSteps, 30);
  assert.equal(legs[0].turnAfterDeg, null);
  assert.ok(Math.abs(legs[0].headingDeg - 90) <= 2);
});

test("wraparound turn (350° to 10°) is a 20° turn, not 340°", () => {
  const segmenter = new RouteSegmenter();

  // Walk at 350°
  for (let i = 0; i < 10; i++) {
    segmenter.addStep(1, 350, i * 500);
  }

  // Manual mark turn to 10°
  segmenter.markTurn(10);

  // Walk at 10°
  for (let i = 0; i < 10; i++) {
    segmenter.addStep(1, 10, (10 + i) * 500);
  }

  const { legs } = segmenter.finish();
  assert.equal(legs.length, 2);
  assert.equal(legs[0].turnAfterDeg, 20); // 350 to 10 is +20 (slight right)
  assert.equal(formatTurnDirection(legs[0].turnAfterDeg!), "slight right");
});

test("merging of tiny legs (< 3 steps) into neighbors", () => {
  const legsWithTiny: Leg[] = [
    { steps: 20, headingDeg: 90, turnAfterDeg: 45 },
    { steps: 2, headingDeg: 135, turnAfterDeg: 45 }, // tiny leg
    { steps: 15, headingDeg: 180, turnAfterDeg: null },
  ];

  const merged = mergeShortLegs(legsWithTiny, 3);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].steps, 22);
  assert.equal(merged[1].steps, 15);
  assert.equal(merged[1].turnAfterDeg, null);

  // First leg is tiny case
  const firstTiny: Leg[] = [
    { steps: 1, headingDeg: 80, turnAfterDeg: 10 },
    { steps: 12, headingDeg: 90, turnAfterDeg: null },
  ];
  const mergedFirst = mergeShortLegs(firstTiny, 3);
  assert.equal(mergedFirst.length, 1);
  assert.equal(mergedFirst[0].steps, 13);
  assert.equal(mergedFirst[0].turnAfterDeg, null);
});
