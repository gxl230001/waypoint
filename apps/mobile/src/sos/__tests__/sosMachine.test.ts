// Run from apps/mobile:  npx tsx --test src/sos/__tests__/sosMachine.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRM_SECONDS,
  COUNTDOWN_SECONDS,
  describeDemoCall,
  describeTransition,
  IDLE,
  resolveTarget,
  sosReducer,
  type SosAction,
  type SosState,
} from "../sosMachine";

const T0 = 1_000_000;
const DEFAULT_TARGET = resolveTarget(null);

function run(actions: SosAction[], start: SosState = IDLE): SosState {
  return actions.reduce(sosReducer, start);
}

const trigger: SosAction = {
  type: "trigger",
  reason: "manual",
  target: DEFAULT_TARGET,
  nowMs: T0,
};

test("with no contact the target is the default demo emergency number", () => {
  const target = resolveTarget(null);
  assert.equal(target.kind, "emergency");
  assert.match(target.name, /911/);
  assert.match(target.name, /demo/);
});

test("a saved contact is used instead of the default", () => {
  const target = resolveTarget({ name: "Sam", phone: "5551234567" });
  assert.deepEqual(target, { kind: "contact", name: "Sam", phone: "5551234567" });
});

test("trigger starts the countdown", () => {
  const state = run([trigger]);
  assert.equal(state.phase, "countdown");
  if (state.phase === "countdown") {
    assert.equal(state.secondsLeft, COUNTDOWN_SECONDS);
    assert.equal(state.reason, "manual");
  }
});

test("triggering again while running does not restart the flow", () => {
  const first = run([trigger]);
  const second = sosReducer(first, { ...trigger, nowMs: T0 + 5000 });
  assert.equal(second, first);
});

test("the countdown ticks down by wall-clock time", () => {
  const state = run([trigger, { type: "tick", nowMs: T0 + 3000 }]);
  assert.equal(state.phase, "countdown");
  if (state.phase === "countdown") assert.equal(state.secondsLeft, 7);
});

test("a tick inside the same second changes nothing", () => {
  const first = run([trigger, { type: "tick", nowMs: T0 + 3000 }]);
  const second = sosReducer(first, { type: "tick", nowMs: T0 + 3100 });
  assert.equal(second, first);
});

test("cancel during the countdown returns to idle", () => {
  const state = run([trigger, { type: "tick", nowMs: T0 + 2000 }, { type: "cancel" }]);
  assert.deepEqual(state, IDLE);
});

test("when the countdown ends the confirmation layer appears, not the call", () => {
  const state = run([trigger, { type: "tick", nowMs: T0 + COUNTDOWN_SECONDS * 1000 }]);
  assert.equal(state.phase, "confirm");
  if (state.phase === "confirm") assert.equal(state.secondsLeft, CONFIRM_SECONDS);
});

test("confirming yes goes to the demo call", () => {
  const state = run([
    trigger,
    { type: "tick", nowMs: T0 + COUNTDOWN_SECONDS * 1000 },
    { type: "confirm" },
  ]);
  assert.equal(state.phase, "called");
  if (state.phase === "called") assert.equal(state.autoProceeded, false);
});

test("confirm is ignored before the confirmation layer", () => {
  const state = run([trigger, { type: "confirm" }]);
  assert.equal(state.phase, "countdown");
});

test("cancel during confirmation returns to idle", () => {
  const state = run([
    trigger,
    { type: "tick", nowMs: T0 + COUNTDOWN_SECONDS * 1000 },
    { type: "cancel" },
  ]);
  assert.deepEqual(state, IDLE);
});

test("no answer to the confirmation continues on its own", () => {
  const confirmStart = T0 + COUNTDOWN_SECONDS * 1000;
  const state = run([
    trigger,
    { type: "tick", nowMs: confirmStart },
    { type: "tick", nowMs: confirmStart + CONFIRM_SECONDS * 1000 },
  ]);
  assert.equal(state.phase, "called");
  if (state.phase === "called") assert.equal(state.autoProceeded, true);
});

test("a late tick after backgrounding still advances the flow", () => {
  // The app was suspended for a minute. One tick arrives afterwards.
  const state = run([trigger, { type: "tick", nowMs: T0 + 60_000 }]);
  assert.equal(state.phase, "confirm");
});

test("cancel does nothing once the call screen is showing", () => {
  const called = run([
    trigger,
    { type: "tick", nowMs: T0 + COUNTDOWN_SECONDS * 1000 },
    { type: "confirm" },
  ]);
  assert.equal(sosReducer(called, { type: "cancel" }), called);
  assert.deepEqual(sosReducer(called, { type: "dismiss" }), IDLE);
});

test("the demo call text always says no real call was placed", () => {
  for (const target of [
    resolveTarget(null),
    resolveTarget({ name: "Sam", phone: "5551234567" }),
  ]) {
    const text = describeDemoCall(target);
    assert.match(text, /demo only/i);
    assert.match(text, /no real call was placed/i);
  }
});

test("the countdown announces itself and the target", () => {
  const next = run([trigger]);
  const effect = describeTransition(IDLE, next);
  assert.match(effect?.speech ?? "", /Emergency help requested/);
  assert.match(effect?.speech ?? "", /911/);
  assert.equal(effect?.haptic, "warning");
});

test("only some seconds are spoken, every second is felt", () => {
  const a = run([trigger]);
  const fiveLeft = run([{ type: "tick", nowMs: T0 + 5000 }], a);
  const threeLeft = run([{ type: "tick", nowMs: T0 + 7000 }], a);
  const quiet = run([{ type: "tick", nowMs: T0 + 1000 }], a); // 9 left
  assert.equal(describeTransition(a, fiveLeft)?.speech, "5");
  assert.equal(describeTransition(a, threeLeft)?.speech, "3");
  assert.equal(describeTransition(a, quiet)?.speech, undefined);
  assert.equal(describeTransition(a, quiet)?.haptic, "tick");
});

test("cancelling is announced", () => {
  const running = run([trigger]);
  const effect = describeTransition(running, IDLE);
  assert.equal(effect?.speech, "Emergency call cancelled.");
});

test("no effect when nothing changed", () => {
  const running = run([trigger]);
  assert.equal(describeTransition(running, running), null);
});
