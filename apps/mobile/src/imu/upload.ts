import type { SessionMetadata, UploadReceipt } from "./types";

const UPLOAD_PATH = "/api/v1/imu/recordings";
const TIMEOUT_MS = 60_000;

export type UploadOutcome =
  | { ok: true; receipt: UploadReceipt }
  | { ok: false; error: string; alreadyOnServer?: boolean };

type ErrorBody = { detail?: unknown };

function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .slice(0, 3)
      .map((d) =>
        typeof d === "string"
          ? d
          : typeof (d as { msg?: unknown })?.msg === "string"
          ? String((d as { msg: string }).msg)
          : JSON.stringify(d)
      )
      .join("; ");
  }
  return "The server rejected the recording.";
}

/**
 * Explicit, user-triggered upload. Returns ok only for an HTTP 201 whose body
 * contains a recording id. A 409 means the server already has this session.
 */
export async function uploadRecording(
  apiUrl: string,
  metadata: SessionMetadata,
  csv: string
): Promise<UploadOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}${UPLOAD_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata, csv }),
      signal: controller.signal,
    });

    if (response.status === 409) {
      return {
        ok: false,
        alreadyOnServer: true,
        error: "The server already has a recording with this session ID.",
      };
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as ErrorBody;
        detail = `${detail}: ${describeDetail(body.detail)}`;
      } catch {
        /* keep the status-only message */
      }
      return { ok: false, error: detail };
    }

    const body = (await response.json()) as { recording_id?: unknown };
    if (typeof body.recording_id !== "string" || body.recording_id.length === 0) {
      return { ok: false, error: "Unexpected response from the server." };
    }
    return {
      ok: true,
      receipt: { recording_id: body.recording_id, uploaded_at_ms: Date.now() },
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "The upload timed out. Check the backend connection."
        : "Cannot reach the backend. Check the IP address, Wi-Fi, and server.",
    };
  } finally {
    clearTimeout(timer);
  }
}
