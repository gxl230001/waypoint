// Regenerates backend/tests/fixtures/ts_generated_session.json using the real
// app code, so the backend is tested against what the phone actually sends.
//   cd apps/mobile && npx tsx src/imu/__tests__/make-fixture.ts
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCsv } from "../csv";
import { buildSessionMetadata } from "../stats";
import type { ImuSample } from "../types";

const samples: ImuSample[] = [];
const startWall = 1_791_000_000_000;
// Deliberately irregular timing and a null native timestamp, like real data.
for (let i = 0; i < 700; i++) {
  const jitter = (i % 7) * 0.37;
  for (const sensor of ["accelerometer", "gyroscope"] as const) {
    const elapsedMs = i * 20 + jitter + (sensor === "gyroscope" ? 3.25 : 0);
    samples.push({
      timestampMs: startWall + elapsedMs,
      elapsedMs,
      sensor,
      x: Math.sin(i / 10) * 0.31,
      y: -0.98 + (i % 5) * 0.0001234567,
      z: 0.05,
      sensorTimestampS: i === 0 && sensor === "gyroscope" ? null : 41_000 + elapsedMs / 1000,
    });
  }
}
samples.sort((a, b) => a.elapsedMs - b.elapsedMs);

const metadata = buildSessionMetadata({
  sessionId: "20261013T224200Z_walking_fx1234",
  activity: "walking",
  status: "completed",
  endReason: "user_stopped",
  startedAtWallMs: startWall,
  durationMs: 14_010,
  samples,
  invalidReadings: 0,
  platformOs: "ios",
});

const out = resolve(__dirname, "../../../../../backend/tests/fixtures/ts_generated_session.json");
writeFileSync(out, JSON.stringify({ metadata, csv: buildCsv(metadata, samples) }));
console.log("wrote", out, samples.length, "rows");
