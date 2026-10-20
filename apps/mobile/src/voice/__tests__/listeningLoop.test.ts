// Run from apps/mobile:  npx tsx --test src/voice/__tests__/listeningLoop.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { ListeningLoop, type LoopEngine, type LoopHandlers, type LoopStatus } from "../listeningLoop";

function setup() {
  let handlers!: LoopHandlers;
  const timers: Array<{ fn: () => void; ms: number; id: number }> = [];
  let nextId = 1;
  const engine = { starts: 0, aborts: 0 };
  const fake: LoopEngine = {
    setHandlers: (h) => (handlers = h),
    startSession: () => void (engine.starts += 1),
    abort: () => void (engine.aborts += 1),
  };
  const heard: string[] = [];
  const statuses: LoopStatus[] = [];
  const loop = new ListeningLoop(fake, {
    onTranscript: (text) => heard.push(text),
    onStatus: (s) => statuses.push(s),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  return { loop, engine, handlers: () => handlers, timers, heard, statuses };
}

test("starts a session and passes transcripts through", () => {
  const t = setup();
  t.loop.start();
  assert.equal(t.engine.starts, 1);
  t.handlers().onResult("hello", true);
  assert.deepEqual(t.heard, ["hello"]);
  assert.deepEqual(t.statuses, ["listening"]);
});

test("restarts after a session ends", () => {
  const t = setup();
  t.loop.start();
  t.handlers().onEnd();
  assert.equal(t.timers.length, 1);
  t.timers[0].fn();
  assert.equal(t.engine.starts, 2);
});

test("backs off after errors and resets once something is heard", () => {
  const t = setup();
  t.loop.start();
  t.handlers().onError("no-speech");
  t.handlers().onEnd();
  const first = t.timers[0].ms;
  t.timers.shift()!.fn();
  t.handlers().onError("no-speech");
  t.handlers().onEnd();
  assert.ok(t.timers[0].ms > first);
  t.timers.shift()!.fn();
  t.handlers().onResult("stop", true);
  t.handlers().onEnd();
  assert.ok(t.timers[0].ms < first);
});

test("a refused microphone stops the loop for good", () => {
  const t = setup();
  t.loop.start();
  t.handlers().onError("not-allowed");
  t.handlers().onEnd();
  assert.equal(t.timers.length, 0);
  assert.equal(t.loop.getStatus(), "denied");
  assert.equal(t.engine.starts, 1);
});

test("stop aborts, cancels a pending restart and ignores late results", () => {
  const t = setup();
  t.loop.start();
  t.handlers().onEnd();
  t.loop.stop();
  assert.equal(t.timers.length, 0);
  assert.equal(t.engine.aborts, 1);
  t.handlers().onResult("late", true);
  assert.deepEqual(t.heard, []);
  assert.equal(t.loop.getStatus(), "stopped");
});
