import type {
  Activity,
  EndReason,
  ImuSample,
  SensorName,
  SensorStats,
  SessionMetadata,
  SessionStatus,
} from "./types";

export const TARGET_HZ = 50;
export const REQUESTED_INTERVAL_MS = 20;
/** One model window is 128 samples at 50 Hz (2.56 s). */
export const WINDOW_SAMPLES = 128;
export const MIN_RECOMMENDED_DURATION_MS = 10_000;
/** For simulated falls/hazards, sessions can be briefer while still covering one model window. */
export const MIN_HAZARD_DURATION_MS = 3_000;
/** Below this, a sensor is flagged as running well under the 50 Hz target. */
export const LOW_RATE_HZ = 40;
export const LARGE_GAP_MS = 250;

function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function computeSensorStats(
  samples: readonly ImuSample[],
  sensor: SensorName
): SensorStats {
  const elapsed: number[] = [];
  const nativeTs: number[] = [];
  let allNativeTs = true;

  for (const s of samples) {
    if (s.sensor !== sensor) continue;
    elapsed.push(s.elapsedMs);
    if (s.sensorTimestampS === null) allNativeTs = false;
    else nativeTs.push(s.sensorTimestampS);
  }

  const n = elapsed.length;
  if (n < 2) {
    return {
      samples: n,
      observed_hz: null,
      observed_hz_sensor_clock: null,
      mean_interval_ms: null,
      median_interval_ms: null,
      max_gap_ms: null,
    };
  }

  const intervals: number[] = new Array(n - 1);
  let maxGap = 0;
  for (let i = 1; i < n; i++) {
    const d = elapsed[i] - elapsed[i - 1];
    intervals[i - 1] = d;
    if (d > maxGap) maxGap = d;
  }

  const span = elapsed[n - 1] - elapsed[0];
  const sorted = [...intervals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  let hzNative: number | null = null;
  if (allNativeTs && nativeTs.length === n) {
    const nativeSpan = nativeTs[n - 1] - nativeTs[0];
    if (nativeSpan > 0) hzNative = round((n - 1) / nativeSpan);
  }

  return {
    samples: n,
    observed_hz: span > 0 ? round(((n - 1) / span) * 1000) : null,
    observed_hz_sensor_clock: hzNative,
    mean_interval_ms: span > 0 ? round(span / (n - 1)) : null,
    median_interval_ms: round(median),
    max_gap_ms: round(maxGap),
  };
}

export type BuildMetadataInput = {
  sessionId: string;
  activity: Activity;
  status: SessionStatus;
  endReason: EndReason;
  startedAtWallMs: number;
  durationMs: number;
  samples: readonly ImuSample[];
  invalidReadings: number;
  platformOs: string;
};

/** Pure: turns a raw sample list into the session metadata, with warnings. */
export function buildSessionMetadata(input: BuildMetadataInput): SessionMetadata {
  const accelerometer = computeSensorStats(input.samples, "accelerometer");
  const gyroscope = computeSensorStats(input.samples, "gyroscope");
  const warnings: string[] = [];

  if (input.status === "interrupted") {
    warnings.push(
      `Recording was interrupted (${input.endReason}) and may be incomplete.`
    );
  }
  if (input.samples.length === 0) {
    warnings.push("No sensor samples were recorded.");
  }

  for (const [name, stats] of [
    ["Accelerometer", accelerometer],
    ["Gyroscope", gyroscope],
  ] as const) {
    if (input.samples.length > 0 && stats.samples === 0) {
      warnings.push(`${name} produced no samples.`);
      continue;
    }
    if (stats.samples > 0 && stats.samples < WINDOW_SAMPLES) {
      warnings.push(
        `${name} has only ${stats.samples} samples, fewer than one ${WINDOW_SAMPLES}-sample window.`
      );
    }
    if (stats.observed_hz !== null && stats.observed_hz < LOW_RATE_HZ) {
      warnings.push(
        `${name} averaged ${stats.observed_hz} Hz, well below the ${TARGET_HZ} Hz target.`
      );
    }
    if (stats.max_gap_ms !== null && stats.max_gap_ms > LARGE_GAP_MS) {
      warnings.push(
        `${name} had a gap of ${stats.max_gap_ms} ms between samples.`
      );
    }
  }

  const minRecommended =
    input.activity === "hazard"
      ? MIN_HAZARD_DURATION_MS
      : MIN_RECOMMENDED_DURATION_MS;
  if (input.durationMs < minRecommended && input.samples.length > 0) {
    warnings.push(
      `Session is short (${(input.durationMs / 1000).toFixed(1)} s). Aim for at least ${minRecommended / 1000} s.`
    );
  }
  if (input.invalidReadings > 0) {
    warnings.push(
      `${input.invalidReadings} readings had non-finite values and were excluded.`
    );
  }

  return {
    schema_version: 1,
    session_id: input.sessionId,
    activity: input.activity,
    status: input.status,
    end_reason: input.endReason,
    started_at_ms: input.startedAtWallMs,
    ended_at_ms: Math.round(input.startedAtWallMs + input.durationMs),
    duration_ms: round(input.durationMs),
    requested_interval_ms: REQUESTED_INTERVAL_MS,
    accelerometer,
    gyroscope,
    total_samples: input.samples.length,
    invalid_readings: input.invalidReadings,
    platform_os: input.platformOs,
    warnings,
  };
}

/** Filesystem-safe and unique: 20261013T224200Z_walking_k3j9x2 */
export function generateSessionId(activity: Activity, now = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${stamp}_${activity}_${rand}`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** For speech: "1 minute 2 seconds". */
export function formatSpoken(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (s > 0 || m === 0) parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}
