// Run from apps/mobile:  npx tsx --test src/voice/__tests__/commands.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSpeech, parseCommand } from "../commands";

test("normalizes case, punctuation and spacing", () => {
  assert.equal(normalizeSpeech("  Start,  Navigation! "), "start navigation");
  assert.equal(normalizeSpeech("What's happening?"), "whats happening");
});

test("recognizes each command", () => {
  const cases: Array<[string, ReturnType<typeof parseCommand>]> = [
    ["start navigation", "startNavigation"],
    ["let's go", "startNavigation"],
    ["stop", "stopNavigation"],
    ["stop navigation", "stopNavigation"],
    ["repeat that", "repeat"],
    ["say that again", "repeat"],
    ["open settings", "settings"],
    ["go to user view", "userView"],
    ["go home", "userView"],
    ["what is the status", "status"],
    ["where am I", "status"],
    ["what can I say", "help"],
    ["help", "help"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(parseCommand(text), expected, text);
  }
});

test("okay and false-alarm phrases dismiss SOS instead of triggering it", () => {
  for (const text of ["I am okay", "I'm fine", "false alarm", "cancel SOS"]) {
    assert.equal(parseCommand(text), "cancelSos", text);
  }
});

test("emergency phrases always win over other commands", () => {
  for (const text of [
    "help me",
    "I need help",
    "emergency",
    "SOS",
    "call 911",
    "I fell",
    "stop I need help",
    "start navigation emergency",
  ]) {
    assert.equal(parseCommand(text), "sos", text);
  }
});

test("empty or unrecognized speech is unknown", () => {
  assert.equal(parseCommand(""), "unknown");
  assert.equal(parseCommand("   "), "unknown");
  assert.equal(parseCommand("banana"), "unknown");
});
