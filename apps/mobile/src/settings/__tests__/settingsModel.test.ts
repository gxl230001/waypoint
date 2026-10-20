// Run from apps/mobile:  npx tsx --test src/settings/__tests__/settingsModel.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSpeechRate,
  DEFAULT_SETTINGS,
  isValidPhone,
  nextTextScale,
  nextVerbosity,
  normalizeSettings,
  stepSpeechRate,
} from "../settingsModel";

test("anything that is not an object gives the defaults", () => {
  for (const raw of [null, undefined, "text", 42, []]) {
    assert.deepEqual(normalizeSettings(raw), DEFAULT_SETTINGS);
  }
});

test("a valid settings object round-trips", () => {
  const saved = {
    speechRate: 1.5,
    verbosity: "detailed",
    hapticsEnabled: false,
    textScale: 1.25,
    highContrast: true,
    emergencyContact: { name: "Sam", phone: "+1 555 123 4567" },
  };
  assert.deepEqual(normalizeSettings(saved), saved);
});

test("invalid fields fall back to defaults without affecting valid ones", () => {
  const result = normalizeSettings({
    speechRate: "fast",
    verbosity: "chatty",
    hapticsEnabled: "yes",
    textScale: 3,
    highContrast: true,
  });
  assert.equal(result.speechRate, DEFAULT_SETTINGS.speechRate);
  assert.equal(result.verbosity, DEFAULT_SETTINGS.verbosity);
  assert.equal(result.hapticsEnabled, DEFAULT_SETTINGS.hapticsEnabled);
  assert.equal(result.textScale, DEFAULT_SETTINGS.textScale);
  assert.equal(result.highContrast, true);
});

test("speech rate is clamped to the allowed range", () => {
  assert.equal(clampSpeechRate(5), 2);
  assert.equal(clampSpeechRate(0.1), 0.5);
  assert.equal(clampSpeechRate(Number.NaN), 1);
  assert.equal(clampSpeechRate(Number.POSITIVE_INFINITY), 1);
});

test("speech rate snaps to the step size", () => {
  assert.equal(clampSpeechRate(1.1), 1);
  assert.equal(clampSpeechRate(1.2), 1.25);
});

test("stepping the rate moves one step and stops at the limits", () => {
  assert.equal(stepSpeechRate(1, 1), 1.25);
  assert.equal(stepSpeechRate(1, -1), 0.75);
  assert.equal(stepSpeechRate(2, 1), 2);
  assert.equal(stepSpeechRate(0.5, -1), 0.5);
});

test("phone numbers", () => {
  assert.equal(isValidPhone("+1 (555) 123-4567"), true);
  assert.equal(isValidPhone("5551234567"), true);
  assert.equal(isValidPhone("abc"), false);
  assert.equal(isValidPhone("12"), false);
  assert.equal(isValidPhone("555-CALL-NOW"), false);
  assert.equal(isValidPhone(""), false);
});

test("an incomplete or invalid emergency contact becomes null", () => {
  const cases = [
    { name: "", phone: "5551234567" },
    { name: "Sam", phone: "abc" },
    { name: "Sam" },
    "Sam",
  ];
  for (const emergencyContact of cases) {
    assert.equal(normalizeSettings({ emergencyContact }).emergencyContact, null);
  }
});

test("emergency contact is trimmed", () => {
  const result = normalizeSettings({
    emergencyContact: { name: "  Sam  ", phone: " 5551234567 " },
  });
  assert.deepEqual(result.emergencyContact, { name: "Sam", phone: "5551234567" });
});

test("text scale and verbosity cycle and wrap", () => {
  assert.equal(nextTextScale(1), 1.25);
  assert.equal(nextTextScale(1.5), 1);
  assert.equal(nextVerbosity("minimal"), "normal");
  assert.equal(nextVerbosity("detailed"), "minimal");
});
