/**
 * Shared types for IMU data collection.
 *
 * Units (as provided by expo-sensors, never converted):
 *   - accelerometer: x, y, z in g (1 g = 9.81 m/s^2). Includes gravity.
 *   - gyroscope:     x, y, z in rad/s (rotation rate around each device axis).
 *   - sensor_timestamp_s: native event timestamp in seconds. iOS: CoreMotion
 *     uptime clock. Android: SensorEvent.timestamp (ns since boot) / 1e9.
 *     Both are "time since boot" style clocks and are only meaningful as
 *     differences. They are NOT epoch times.
 */

export const ACTIVITIES = [
  "stationary",
  "walking",
  "running",
  "hazard",
] as const;

/** The only labels that may enter the dataset. */
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABELS: Record<Activity, string> = {
  stationary: "Stationary",
  walking: "Walking",
  running: "Running",
  hazard: "Hazard",
};

export type SensorName = "accelerometer" | "gyroscope";

/** One raw reading. activity and session_id are constant per session, so they
 *  are added when the CSV is written instead of being stored per sample. */
export type ImuSample = {
  /** Epoch ms, derived as sessionStartWallMs + elapsedMs (see recorder). */
  timestampMs: number;
  /** Monotonic ms since the session started, taken when the callback ran. */
  elapsedMs: number;
  sensor: SensorName;
  x: number;
  y: number;
  z: number;
  /** Native event timestamp in seconds, or null if the platform omitted it. */
  sensorTimestampS: number | null;
};

export type SensorStats = {
  samples: number;
  /** (n-1) / span of callback times. Null with fewer than 2 samples. */
  observed_hz: number | null;
  /** Same, computed from the native sensor timestamps when available. */
  observed_hz_sensor_clock: number | null;
  mean_interval_ms: number | null;
  median_interval_ms: number | null;
  /** Largest gap between consecutive callbacks, in ms. */
  max_gap_ms: number | null;
};

/** completed = user pressed stop. interrupted = ended by something else. */
export type SessionStatus = "completed" | "interrupted";

export type EndReason =
  | "user_stopped"
  | "app_backgrounded"
  | "app_unmounted";

export type SessionMetadata = {
  schema_version: 1;
  session_id: string;
  activity: Activity;
  status: SessionStatus;
  end_reason: EndReason;
  /** Wall-clock epoch ms at session start. */
  started_at_ms: number;
  /** started_at_ms + monotonic duration, so it can never precede the start. */
  ended_at_ms: number;
  /** Monotonic duration in ms. */
  duration_ms: number;
  requested_interval_ms: number;
  accelerometer: SensorStats;
  gyroscope: SensorStats;
  total_samples: number;
  /** Readings with non-finite values. Excluded from the CSV, but counted. */
  invalid_readings: number;
  platform_os: string;
  warnings: string[];
};

/** A recording that was written to the device successfully. */
export type StoredRecording = {
  metadata: SessionMetadata;
  csvUri: string;
  csvName: string;
  upload: UploadReceipt | null;
};

export type UploadReceipt = {
  recording_id: string;
  uploaded_at_ms: number;
};

/** Output of the recorder when a session ends, before anything is saved. */
export type FinishedRecording = {
  metadata: SessionMetadata;
  samples: ImuSample[];
};
