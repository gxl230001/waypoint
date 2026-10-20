// Run from apps/mobile:  npx tsx --test src/voice/__tests__/voiceRouter.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { parseSosReply } from "../commands";
import { routeTranscript, type VoiceContext } from "../voiceRouter";

const idle: VoiceContext = { sosPhase: "idle", assistantSpeaking: false };
const sos = (sosPhase: VoiceContext["sosPhase"]): VoiceContext => ({
  sosPhase,
  assistantSpeaking: false,
});

test("SOS replies: cancel phrases cancel during countdown and confirm", () => {
  for (const text of ["I'm okay", "I am okay", "I'm fine", "false alarm", "no", "cancel", "stop"]) {
    assert.equal(parseSosReply(text, "countdown"), "cancel", text);
    assert.equal(parseSosReply(text, "confirm"), "cancel", text);
  }
});

test("SOS replies: only confirm phase accepts yes, and cancel wins over it", () => {
  assert.equal(parseSosReply("yes", "confirm"), "confirm");
  assert.equal(parseSosReply("yes call now", "confirm"), "confirm");
  assert.equal(parseSosReply("I need help", "confirm"), "confirm");
  assert.equal(parseSosReply("no I am okay", "confirm"), "cancel");
  assert.equal(parseSosReply("yes", "countdown"), null);
  assert.equal(parseSosReply("banana", "confirm"), null);
});

test("SOS replies: done dismisses the final popup", () => {
  assert.equal(parseSosReply("done", "called"), "dismiss");
  assert.equal(parseSosReply("okay", "called"), "dismiss");
  assert.equal(parseSosReply("banana", "called"), null);
});

test("ignores everything while the app itself is speaking", () => {
  const speaking = { ...sos("countdown"), assistantSpeaking: true };
  assert.equal(routeTranscript("I am okay", true, speaking), null);
  assert.equal(routeTranscript("start navigation", true, { ...idle, assistantSpeaking: true }), null);
});

test("during SOS, partial results already count and other commands are ignored", () => {
  assert.deepEqual(routeTranscript("I'm okay", false, sos("countdown")), {
    type: "sosReply",
    reply: "cancel",
  });
  assert.equal(routeTranscript("start navigation", true, sos("countdown")), null);
});

test("when idle, only final short phrases become commands", () => {
  assert.equal(routeTranscript("start navigation", false, idle), null);
  assert.deepEqual(routeTranscript("start navigation", true, idle), {
    type: "command",
    command: "startNavigation",
  });
  assert.deepEqual(routeTranscript("help me", true, idle), {
    type: "command",
    command: "sos",
  });
});

test("when idle, long conversation and unknown phrases are ignored", () => {
  assert.equal(
    routeTranscript("so yesterday I was telling my friend that we should stop by", true, idle),
    null
  );
  assert.equal(routeTranscript("banana", true, idle), null);
  assert.equal(routeTranscript("", true, idle), null);
});
