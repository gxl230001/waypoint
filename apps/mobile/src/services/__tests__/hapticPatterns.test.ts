// Run from apps/mobile:  npx tsx --test src/services/__tests__/hapticPatterns.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  HAPTIC_PATTERNS,
  playCue,
  type HapticCue,
  type HapticDriver,
} from "../hapticPatterns";

function recordingDriver() {
  const events: string[] = [];
  const driver: HapticDriver = {
    impact: (strength) => {
      events.push(`impact:${strength}`);
    },
    notify: (type) => {
      events.push(`notify:${type}`);
    },
    wait: async (ms) => {
      events.push(`wait:${ms}`);
    },
  };
  return { driver, events };
}

test("every cue has a non-empty pattern", () => {
  for (const [name, steps] of Object.entries(HAPTIC_PATTERNS)) {
    assert.ok(steps.length > 0, `${name} has no steps`);
  }
});

test("left and right can be told apart by feel", () => {
  assert.notDeepEqual(HAPTIC_PATTERNS.left, HAPTIC_PATTERNS.right);
  assert.notDeepEqual(HAPTIC_PATTERNS.left, HAPTIC_PATTERNS.straight);
  assert.notDeepEqual(HAPTIC_PATTERNS.right, HAPTIC_PATTERNS.straight);
});

test("left plays two light taps with a pause", async () => {
  const { driver, events } = recordingDriver();
  await playCue("left", driver);
  assert.deepEqual(events, ["impact:light", "wait:120", "impact:light"]);
});

test("hazard plays three heavy taps", async () => {
  const { driver, events } = recordingDriver();
  await playCue("hazard", driver);
  assert.equal(events.filter((e) => e === "impact:heavy").length, 3);
});

test("a cue stops early when it is replaced", async () => {
  const { driver, events } = recordingDriver();
  let calls = 0;
  await playCue("hazard", driver, () => {
    calls += 1;
    return calls <= 2; // allow the first step and the pause, then stop
  });
  assert.deepEqual(events, ["impact:heavy", "wait:80"]);
});

test("a failing driver does not throw", async () => {
  const driver: HapticDriver = {
    impact: () => {
      throw new Error("no haptic engine");
    },
    notify: () => {
      throw new Error("no haptic engine");
    },
    wait: async () => {},
  };
  const cues: HapticCue[] = ["left", "arrived"];
  for (const cue of cues) {
    await assert.doesNotReject(playCue(cue, driver));
  }
});
