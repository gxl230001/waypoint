// Run from apps/mobile:  npx tsx --test src/imu/__tests__/core.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, CSV_COLUMNS, escapeCsvField } from "../csv";
import {
  buildSessionMetadata,
  computeSensorStats,
  formatClock,
  formatSpoken,
  generateSessionId,
} from "../stats";
import type { ImuSample } from "../types";

function stream(
  sensor: ImuSample["sensor"],
  count: number,
  intervalMs: number,
  offsetMs = 0
): ImuSample[] {
  return Array.from({ length: count }, (_, i) => {
    const elapsedMs = offsetMs + i * intervalMs;
    return {
      timestampMs: 1_700_000_000_000 + elapsedMs,
      elapsedMs,
      sensor,
      x: 0.1 * i,
      y: -0.25,
      z: 1.0000000001,
      sensorTimestampS: 5000 + elapsedMs / 1000,
    };
  });
}

test("escapeCsvField quotes commas, quotes and newlines", () => {
  assert.equal(escapeCsvField("plain"), "plain");
  assert.equal(escapeCsvField("a,b"), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
  assert.equal(escapeCsvField(null), "");
  assert.equal(escapeCsvField(3.5), "3.5");
});

test("buildCsv writes header, one row per sample, callback order, full precision", () => {
  const samples = [
    ...stream("accelerometer", 2, 20),
    ...stream("gyroscope", 1, 20, 7),
  ].sort((a, b) => a.elapsedMs - b.elapsedMs);
  samples[0].sensorTimestampS = null;

  const csv = buildCsv({ session_id: "s1", activity: "walking" }, samples);
  const lines = csv.trimEnd().split("\n");

  assert.equal(lines[0], CSV_COLUMNS.join(","));
  assert.equal(lines.length, 1 + samples.length);
  assert.ok(csv.endsWith("\n"));
  // interleaved in arrival order, not grouped by sensor
  assert.deepEqual(
    lines.slice(1).map((l) => l.split(",")[3]),
    ["accelerometer", "gyroscope", "accelerometer"]
  );
  // z keeps its full precision (no rounding)
  assert.equal(lines[1].split(",")[6], "1.0000000001");
  // null native timestamp becomes an empty trailing field
  assert.ok(lines[1].endsWith(","));
  // every row has the same number of columns and carries session + activity
  for (const l of lines.slice(1)) {
    const f = l.split(",");
    assert.equal(f.length, CSV_COLUMNS.length);
    assert.equal(f[0], "s1");
    assert.equal(f[7], "walking");
  }
});

test("computeSensorStats reports the real rate, not the requested one", () => {
  const regular = computeSensorStats(stream("accelerometer", 501, 20), "accelerometer");
  assert.equal(regular.samples, 501);
  assert.equal(regular.observed_hz, 50);
  assert.equal(regular.observed_hz_sensor_clock, 50);
  assert.equal(regular.median_interval_ms, 20);
  assert.equal(regular.max_gap_ms, 20);

  // 25 Hz stream plus one 400 ms stall
  const slow = stream("gyroscope", 101, 40);
  for (let i = 50; i < slow.length; i++) slow[i].elapsedMs += 360;
  const s = computeSensorStats(slow, "gyroscope");
  assert.equal(s.max_gap_ms, 400);
  assert.ok(s.observed_hz! < 25);

  // sensors are measured independently
  const mixed = [...stream("accelerometer", 3, 20), ...stream("gyroscope", 11, 10)];
  assert.equal(computeSensorStats(mixed, "accelerometer").samples, 3);
  assert.equal(computeSensorStats(mixed, "gyroscope").observed_hz, 100);

  const none = computeSensorStats([], "gyroscope");
  assert.equal(none.samples, 0);
  assert.equal(none.observed_hz, null);
});

const base = {
  sessionId: "20261013T224200Z_walking_abc123",
  activity: "walking" as const,
  status: "completed" as const,
  endReason: "user_stopped" as const,
  startedAtWallMs: 1_700_000_000_000,
  invalidReadings: 0,
  platformOs: "ios",
};

test("a healthy 30 s session has no warnings", () => {
  const samples = [...stream("accelerometer", 1501, 20), ...stream("gyroscope", 1501, 20)];
  const m = buildSessionMetadata({ ...base, samples, durationMs: 30_000 });
  assert.deepEqual(m.warnings, []);
  assert.equal(m.total_samples, 3002);
  assert.equal(m.ended_at_ms, base.startedAtWallMs + 30_000);
  assert.equal(m.schema_version, 1);
});

test("empty, short, slow, gappy, one-sensor and interrupted sessions are flagged", () => {
  const empty = buildSessionMetadata({ ...base, samples: [], durationMs: 3000 });
  assert.ok(empty.warnings.some((w) => /No sensor samples/.test(w)));

  const oneSensor = buildSessionMetadata({
    ...base,
    samples: stream("accelerometer", 600, 20),
    durationMs: 12_000,
  });
  assert.ok(oneSensor.warnings.some((w) => /Gyroscope produced no samples/.test(w)));

  const short = buildSessionMetadata({
    ...base,
    samples: [...stream("accelerometer", 60, 20), ...stream("gyroscope", 60, 20)],
    durationMs: 1200,
  });
  assert.ok(short.warnings.some((w) => /fewer than one 128-sample window/.test(w)));
  assert.ok(short.warnings.some((w) => /Session is short/.test(w)));

  const slow = buildSessionMetadata({
    ...base,
    samples: [...stream("accelerometer", 400, 50), ...stream("gyroscope", 400, 20)],
    durationMs: 20_000,
  });
  assert.ok(slow.warnings.some((w) => /Accelerometer averaged 20 Hz/.test(w)));

  const interrupted = buildSessionMetadata({
    ...base,
    status: "interrupted",
    endReason: "app_backgrounded",
    invalidReadings: 2,
    samples: [...stream("accelerometer", 600, 20), ...stream("gyroscope", 600, 20)],
    durationMs: 12_000,
  });
  assert.equal(interrupted.status, "interrupted");
  assert.ok(interrupted.warnings.some((w) => /interrupted/.test(w)));
  assert.ok(interrupted.warnings.some((w) => /2 readings had non-finite/.test(w)));
});

test("session ids are filesystem-safe and unique", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const id = generateSessionId("hazard", new Date("2026-10-13T22:42:00.123Z"));
    assert.match(id, /^[A-Za-z0-9_-]{8,80}$/);
    assert.ok(id.startsWith("20261013T224200Z_hazard_"));
    ids.add(id);
  }
  assert.ok(ids.size > 490);
});

test("hazard activity allows shorter simulated fall sessions (>= 3s) without warning", () => {
  const fallSession = buildSessionMetadata({
    ...base,
    activity: "hazard",
    samples: [
      ...stream("accelerometer", 200, 20),
      ...stream("gyroscope", 200, 20),
    ],
    durationMs: 4000,
  });
  assert.equal(fallSession.activity, "hazard");
  assert.ok(!fallSession.warnings.some((w) => /Session is short/.test(w)));

  const tooShortFall = buildSessionMetadata({
    ...base,
    activity: "hazard",
    samples: [
      ...stream("accelerometer", 100, 20),
      ...stream("gyroscope", 100, 20),
    ],
    durationMs: 2000,
  });
  assert.ok(tooShortFall.warnings.some((w) => /Session is short/.test(w)));
});

test("duration formatting", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(62_999), "1:02");
  assert.equal(formatSpoken(62_000), "1 minute 2 seconds");
  assert.equal(formatSpoken(1000), "1 second");
  assert.equal(formatSpoken(120_000), "2 minutes");
});
