import type { ImuSample, SessionMetadata } from "./types";

/**
 * Raw long-form schema: one row per sensor reading.
 * Keep in sync with backend/imu.py (EXPECTED_COLUMNS) and the README.
 */
export const CSV_COLUMNS = [
  "session_id",
  "timestamp_ms",
  "elapsed_ms",
  "sensor",
  "x",
  "y",
  "z",
  "activity",
  "sensor_timestamp_s",
] as const;

/** RFC 4180 style escaping: quote fields containing a comma, quote, CR or LF. */
export function escapeCsvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Timing columns keep microsecond precision; axis values are written as-is. */
function fixed3(n: number): string {
  return n.toFixed(3);
}

/**
 * Builds the CSV text for a finished session. Lines end with "\n".
 * Rows stay in callback order, so the two sensor streams are interleaved
 * exactly as they arrived. Nothing is merged or resampled.
 */
export function buildCsv(
  metadata: Pick<SessionMetadata, "session_id" | "activity">,
  samples: readonly ImuSample[]
): string {
  const sessionId = escapeCsvField(metadata.session_id);
  const activity = escapeCsvField(metadata.activity);

  const lines: string[] = new Array(samples.length + 1);
  lines[0] = CSV_COLUMNS.join(",");

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    lines[i + 1] = [
      sessionId,
      fixed3(s.timestampMs),
      fixed3(s.elapsedMs),
      s.sensor,
      String(s.x),
      String(s.y),
      String(s.z),
      activity,
      s.sensorTimestampS === null ? "" : String(s.sensorTimestampS),
    ].join(",");
  }

  return lines.join("\n") + "\n";
}
