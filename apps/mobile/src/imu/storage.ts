import { Directory, File, Paths } from "expo-file-system";
import { buildCsv } from "./csv";
import type {
  ImuSample,
  SessionMetadata,
  StoredRecording,
  UploadReceipt,
} from "./types";

/**
 * Layout inside the app's document directory (Paths.document/imu_recordings/):
 *   <session_id>.csv          raw samples. Never modified after it is written.
 *   <session_id>.meta.json    session metadata. Never modified after writing.
 *   <session_id>.upload.json  receipt, created only after a successful upload.
 *
 * On iPhone this folder is visible in the Files app only if the app enables
 * file sharing; otherwise use the Share button to move files off the device.
 */
const DIR_NAME = "imu_recordings";
const MAX_ID_ATTEMPTS = 20;

function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type SaveResult =
  | { ok: true; stored: StoredRecording }
  | { ok: false; error: string };

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Picks a session id whose files do not exist yet. Practically always the
 *  first one; the loop only guards against a random-suffix collision. */
function uniqueBaseName(dir: Directory, preferred: string): string {
  const taken = (base: string) =>
    new File(dir, `${base}.csv`).exists ||
    new File(dir, `${base}.csv.part`).exists ||
    new File(dir, `${base}.meta.json`).exists;

  if (!taken(preferred)) return preferred;
  for (let i = 2; i < MAX_ID_ATTEMPTS + 2; i++) {
    const candidate = `${preferred}_${i}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error("Could not find an unused file name.");
}

/**
 * Writes the CSV and metadata sidecar. Returns ok only after both files exist
 * with the expected size. Synchronous on purpose, so it can also run while the
 * app is unmounting or moving to the background.
 *
 * Failure leaves no partial files behind and the caller keeps the samples.
 */
export function saveRecording(
  metadata: SessionMetadata,
  samples: readonly ImuSample[]
): SaveResult {
  if (samples.length === 0) {
    return { ok: false, error: "The recording is empty, so there is nothing to save." };
  }

  const created: File[] = [];
  try {
    const dir = recordingsDir();
    const base = uniqueBaseName(dir, metadata.session_id);
    // If a collision forced a new name, the session id inside the file must
    // match the file name so the dataset stays self-consistent.
    const finalMeta: SessionMetadata = { ...metadata, session_id: base };

    const csv = buildCsv(finalMeta, samples);

    const part = new File(dir, `${base}.csv.part`);
    created.push(part);
    part.create({ overwrite: false });
    part.write(csv);
    // CSV content is ASCII only, so characters equal bytes.
    if (part.size !== csv.length) {
      throw new Error(
        `Write verification failed (expected ${csv.length} bytes, found ${part.size}).`
      );
    }

    const csvFile = new File(dir, `${base}.csv`);
    part.moveSync(csvFile, { overwrite: false });
    created.length = 0;
    created.push(csvFile);

    const metaFile = new File(dir, `${base}.meta.json`);
    created.push(metaFile);
    metaFile.create({ overwrite: false });
    const metaJson = JSON.stringify(finalMeta, null, 2);
    metaFile.write(metaJson);
    if (!metaFile.exists || metaFile.size === 0) {
      throw new Error("Metadata file verification failed.");
    }

    return {
      ok: true,
      stored: {
        metadata: finalMeta,
        csvUri: csvFile.uri,
        csvName: csvFile.name,
        upload: null,
      },
    };
  } catch (e) {
    // Roll back files created by this failed attempt only.
    for (const f of created) {
      try {
        if (f.exists) f.delete();
      } catch {
        /* nothing more can be done */
      }
    }
    return { ok: false, error: errorText(e) };
  }
}

/** Reads a stored CSV back as text (used for upload). */
export async function readCsvText(csvUri: string): Promise<string> {
  const file = new File(csvUri);
  if (!file.exists) throw new Error("The CSV file no longer exists on this device.");
  return file.text();
}

export function writeUploadReceipt(
  sessionId: string,
  receipt: UploadReceipt
): void {
  const dir = recordingsDir();
  const file = new File(dir, `${sessionId}.upload.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(receipt, null, 2));
}

function isSessionMetadata(value: unknown): value is SessionMetadata {
  const v = value as Partial<SessionMetadata> | null;
  return (
    !!v &&
    v.schema_version === 1 &&
    typeof v.session_id === "string" &&
    typeof v.activity === "string" &&
    typeof v.duration_ms === "number" &&
    typeof v.total_samples === "number" &&
    !!v.accelerometer &&
    !!v.gyroscope
  );
}

/** Lists saved recordings, newest first. Entries that cannot be read are
 *  skipped and counted, never silently treated as valid. */
export function listRecordings(): { items: StoredRecording[]; unreadable: number } {
  const dir = recordingsDir();
  const items: StoredRecording[] = [];
  let unreadable = 0;

  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(".meta.json")) continue;
    try {
      const metadata: unknown = JSON.parse(entry.textSync());
      if (!isSessionMetadata(metadata)) throw new Error("bad metadata");

      const base = entry.name.slice(0, -".meta.json".length);
      const csv = new File(dir, `${base}.csv`);
      if (!csv.exists) throw new Error("missing csv");

      let upload: UploadReceipt | null = null;
      const receiptFile = new File(dir, `${base}.upload.json`);
      if (receiptFile.exists) {
        try {
          upload = JSON.parse(receiptFile.textSync()) as UploadReceipt;
        } catch {
          upload = null;
        }
      }
      items.push({ metadata, csvUri: csv.uri, csvName: csv.name, upload });
    } catch {
      unreadable += 1;
    }
  }

  items.sort((a, b) => b.metadata.started_at_ms - a.metadata.started_at_ms);
  return { items, unreadable };
}
