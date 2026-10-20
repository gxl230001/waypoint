// Run from apps/mobile:  npx tsx --test src/services/__tests__/speechQueue.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  SpeechQueue,
  type SpeechEngine,
  type SpeechHandlers,
} from "../speechQueue";

type FakeEngine = SpeechEngine & {
  spoken: string[];
  stops: number;
  finishCurrent: () => void;
};

function fakeEngine(): FakeEngine {
  let current: SpeechHandlers | null = null;
  const engine: FakeEngine = {
    spoken: [],
    stops: 0,
    speak(text, handlers) {
      engine.spoken.push(text);
      current = handlers;
    },
    stop() {
      engine.stops += 1;
    },
    finishCurrent() {
      const handlers = current;
      current = null;
      handlers?.onDone();
    },
  };
  return engine;
}

function setup() {
  const engine = fakeEngine();
  let time = 0;
  const queue = new SpeechQueue(engine, { now: () => time });
  return {
    engine,
    queue,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test("speaks immediately when idle", () => {
  const { engine, queue } = setup();
  assert.equal(queue.say("Turn left", "direction"), true);
  assert.deepEqual(engine.spoken, ["Turn left"]);
});

test("ignores empty text", () => {
  const { engine, queue } = setup();
  assert.equal(queue.say("   ", "direction"), false);
  assert.deepEqual(engine.spoken, []);
});

test("a direction waits for the current utterance to finish", () => {
  const { engine, queue } = setup();
  queue.say("First", "direction");
  queue.say("Second", "direction");
  assert.deepEqual(engine.spoken, ["First"]);

  engine.finishCurrent();
  assert.deepEqual(engine.spoken, ["First", "Second"]);
});

test("only the newest waiting direction is kept", () => {
  const { engine, queue } = setup();
  queue.say("First", "direction");
  queue.say("Old", "direction");
  queue.say("New", "direction");

  engine.finishCurrent();
  assert.deepEqual(engine.spoken, ["First", "New"]);
});

test("a hazard interrupts speech and clears the waiting direction", () => {
  const { engine, queue } = setup();
  queue.say("Walk forward", "direction");
  queue.say("Then turn", "direction");
  queue.say("Obstacle ahead", "hazard");

  assert.equal(engine.stops, 1);
  assert.deepEqual(engine.spoken, ["Walk forward", "Obstacle ahead"]);

  engine.finishCurrent();
  assert.deepEqual(engine.spoken, ["Walk forward", "Obstacle ahead"]);
});

test("info is dropped while something is speaking", () => {
  const { engine, queue } = setup();
  queue.say("Walk forward", "direction");
  assert.equal(queue.say("Battery at 50 percent", "info"), false);

  engine.finishCurrent();
  assert.deepEqual(engine.spoken, ["Walk forward"]);
});

test("info is spoken when idle", () => {
  const { engine, queue } = setup();
  assert.equal(queue.say("Battery at 50 percent", "info"), true);
  assert.deepEqual(engine.spoken, ["Battery at 50 percent"]);
});

test("the same text is not repeated inside the duplicate window", () => {
  const { engine, queue, advance } = setup();
  queue.say("Turn left", "direction");
  engine.finishCurrent();

  advance(500);
  assert.equal(queue.say("Turn left", "direction"), false);

  advance(2000);
  assert.equal(queue.say("Turn left", "direction"), true);
  assert.deepEqual(engine.spoken, ["Turn left", "Turn left"]);
});

test("repeatLast repeats immediately even inside the duplicate window", () => {
  const { engine, queue } = setup();
  queue.say("Turn left", "direction");
  engine.finishCurrent();

  assert.equal(queue.repeatLast(), true);
  assert.deepEqual(engine.spoken, ["Turn left", "Turn left"]);
});

test("repeatLast does nothing before anything was spoken", () => {
  const { queue } = setup();
  assert.equal(queue.repeatLast(), false);
});

test("stop clears waiting speech and ignores a late callback", () => {
  const { engine, queue } = setup();
  queue.say("First", "direction");
  queue.say("Second", "direction");
  queue.stop();
  assert.equal(engine.stops, 1);

  engine.finishCurrent(); // callback arrives after stop
  assert.deepEqual(engine.spoken, ["First"]);
  assert.equal(queue.isBusy(), false);
});

test("an interrupted utterance's stopped callback does not start the next one twice", () => {
  const { engine, queue } = setup();
  queue.say("Walk forward", "direction");
  queue.say("Obstacle ahead", "hazard");

  // The engine reports the first utterance as stopped after the hazard began.
  engine.finishCurrent();
  engine.finishCurrent();
  assert.deepEqual(engine.spoken, ["Walk forward", "Obstacle ahead"]);
});
