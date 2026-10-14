import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { ActionButton } from "../components/ActionButton";
import { formatClock, formatSpoken } from "./stats";
import { listRecordings, readCsvText, saveRecording, writeUploadReceipt } from "./storage";
import { uploadRecording } from "./upload";
import { useImuRecorder } from "./useImuRecorder";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  type Activity,
  type FinishedRecording,
  type SessionMetadata,
  type StoredRecording,
  type ImuSample,
} from "./types";

export type ImuSummary = {
  recording: boolean;
  activityLabel: string | null;
  totalSamples: number;
};

type Props = {
  apiUrl: string | undefined;
  /** Latest human-readable status, shown in the app's "Latest update" card. */
  onMessage: (message: string) => void;
  /** Coarse summary for the top status card. Changes about once per second. */
  onSummaryChange: (summary: ImuSummary) => void;
};

type Result =
  | { kind: "saved"; stored: StoredRecording }
  | { kind: "unsaved"; metadata: SessionMetadata; samples: ImuSample[]; error: string }
  | { kind: "empty"; metadata: SessionMetadata };

type Busy = { id: string; kind: "share" | "upload" } | null;

const HISTORY_SHOWN = 5;

const quietHaptic = {
  start: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  stop: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  warning: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () =>
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

function hz(value: number | null): string {
  return value === null ? "not enough data" : `${value.toFixed(1)} Hz`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ImuCollectionPanel({ apiUrl, onMessage, onSummaryChange }: Props) {
  const [selected, setSelected] = useState<Activity | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<StoredRecording[]>([]);
  const [unreadable, setUnreadable] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  /** Spoken once the app is active again after an interruption. */
  const pendingNotice = useRef<string | null>(null);

  const say = useCallback(
    (spoken: string, shown: string = spoken) => {
      if (!mountedRef.current) return;
      onMessage(shown);
      // Queued, not interrupting: one short announcement per event.
      Speech.speak(spoken);
    },
    [onMessage]
  );

  const reload = useCallback(() => {
    try {
      const { items, unreadable: bad } = listRecordings();
      if (!mountedRef.current) return;
      setHistory(items);
      setUnreadable(bad);
      // Keep the "last recording" card in sync with what is on disk.
      setResult((prev) => {
        if (prev?.kind !== "saved") return prev;
        const fresh = items.find((i) => i.csvName === prev.stored.csvName);
        return fresh ? { kind: "saved", stored: fresh } : prev;
      });
    } catch (e) {
      if (mountedRef.current) setStartError(`Could not read saved recordings: ${errorText(e)}`);
    }
  }, []);

  /** Runs whenever a session ends: user stop, background, or unmount. */
  const handleFinished = (finished: FinishedRecording) => {
    const { metadata, samples } = finished;
    const label = ACTIVITY_LABELS[metadata.activity];
    const interrupted = metadata.status === "interrupted";

    if (samples.length === 0) {
      if (mountedRef.current) setResult({ kind: "empty", metadata });
      quietHaptic.error();
      say(
        "Recording stopped, but no sensor data was captured. Nothing was saved.",
        "Recording was empty. Nothing was saved."
      );
      return;
    }

    // Synchronous write, so it also completes during unmount or backgrounding.
    const save = saveRecording(metadata, samples);

    if (!save.ok) {
      if (mountedRef.current) {
        setResult({ kind: "unsaved", metadata, samples, error: save.error });
      }
      quietHaptic.error();
      say(
        `Recording stopped but could not be saved. The data is still held in memory. Use Retry Save.`,
        `NOT SAVED: ${save.error} The data is held in memory only. Use Retry Save.`
      );
      return;
    }

    if (mountedRef.current) {
      setResult({ kind: "saved", stored: save.stored });
      reload();
    }

    const counts = `${metadata.accelerometer.samples} accelerometer and ${metadata.gyroscope.samples} gyroscope samples`;
    const warn =
      metadata.warnings.length > 0
        ? ` ${metadata.warnings.length} ${
            metadata.warnings.length === 1 ? "warning" : "warnings"
          }. Review them on screen.`
        : "";

    if (interrupted) {
      quietHaptic.warning();
      const spoken = `Recording was interrupted and may be incomplete. Partial data was saved. ${label}, ${formatSpoken(
        metadata.duration_ms
      )}, ${counts}.${warn}`;
      if (metadata.end_reason === "app_backgrounded") {
        // Speech would not be heard now; deliver it when the app returns.
        onMessage("Recording was interrupted because the app moved to the background.");
        pendingNotice.current = spoken;
      } else {
        say(spoken);
      }
      return;
    }

    say(
      `Recording stopped and saved. ${label}, ${formatSpoken(metadata.duration_ms)}, ${counts}.${warn}`,
      `Saved ${label} recording: ${formatClock(metadata.duration_ms)}, ${metadata.total_samples} samples.`
    );
  };

  const recorder = useImuRecorder(handleFinished);
  const isRecording = recorder.phase === "recording";
  const isIdle = recorder.phase === "idle";
  const hasUnsaved = result?.kind === "unsaved";

  useEffect(() => {
    mountedRef.current = true;
    reload();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && pendingNotice.current) {
        const text = pendingNotice.current;
        pendingNotice.current = null;
        Speech.speak(text);
      }
    });
    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [reload]);

  // Update the top status card about once per second, not per sensor callback.
  const whole = Math.floor(recorder.live.elapsedMs / 1000);
  const total = recorder.live.accelerometer + recorder.live.gyroscope;
  useEffect(() => {
    onSummaryChange({
      recording: isRecording,
      activityLabel: selected ? ACTIVITY_LABELS[selected] : null,
      totalSamples: total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, selected, whole]);

  async function onStart() {
    if (!selected) return;
    if (hasUnsaved) {
      say("Save or discard the unsaved recording before starting a new one.");
      return;
    }
    setStartError(null);
    const label = ACTIVITY_LABELS[selected];
    const started = await recorder.start(selected);
    if (!started.ok) {
      setStartError(started.error);
      quietHaptic.error();
      say(`Could not start recording. ${started.error}`);
      return;
    }
    quietHaptic.start();
    say(`Recording ${label} started.`, `Recording ${label}. Tap Stop Recording when finished.`);
  }

  function onStop() {
    quietHaptic.stop();
    recorder.stop(); // result is handled in handleFinished
  }

  function onRetrySave() {
    if (result?.kind !== "unsaved") return;
    const { metadata, samples } = result;
    const save = saveRecording(metadata, samples);
    if (save.ok) {
      setResult({ kind: "saved", stored: save.stored });
      reload();
      say("Recording saved.", `Saved ${ACTIVITY_LABELS[metadata.activity]} recording.`);
    } else {
      setResult({ kind: "unsaved", metadata, samples, error: save.error });
      quietHaptic.error();
      say("Still could not save the recording.", `NOT SAVED: ${save.error}`);
    }
  }

  function onDiscard() {
    Alert.alert(
      "Discard unsaved recording?",
      "This data has not been saved anywhere. It cannot be recovered.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            setResult(null);
            say("Unsaved recording discarded.");
          },
        },
      ]
    );
  }

  async function onShare(rec: StoredRecording) {
    if (busy) return;
    setBusy({ id: rec.metadata.session_id, kind: "share" });
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is not available on this device.");
      }
      await Sharing.shareAsync(rec.csvUri, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
        dialogTitle: `Share ${rec.csvName}`,
      });
      // iOS does not report whether the user picked a destination or cancelled.
      onMessage(
        "Share sheet closed. The file is still on this device. If you saved or sent it, confirm that it arrived."
      );
    } catch (e) {
      quietHaptic.error();
      say(`Could not share the file. ${errorText(e)}`);
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  async function onUpload(rec: StoredRecording) {
    if (busy) return;
    if (!apiUrl) {
      say("Backend address is not configured. Set EXPO_PUBLIC_API_URL in the mobile .env file.");
      return;
    }
    const id = rec.metadata.session_id;
    setBusy({ id, kind: "upload" });
    try {
      const csv = await readCsvText(rec.csvUri);
      const outcome = await uploadRecording(apiUrl, rec.metadata, csv);

      if (outcome.ok) {
        try {
          writeUploadReceipt(id, outcome.receipt);
          say("Recording uploaded to the backend.", `Uploaded as ${outcome.receipt.recording_id}.`);
        } catch (e) {
          say(
            "Uploaded, but the upload status could not be stored on this device.",
            `Uploaded as ${outcome.receipt.recording_id}, but saving the upload status failed: ${errorText(e)}`
          );
        }
        reload();
      } else if (outcome.alreadyOnServer) {
        try {
          writeUploadReceipt(id, { recording_id: id, uploaded_at_ms: Date.now() });
        } catch {
          /* receipt is only a convenience */
        }
        say("The server already has this recording.");
        reload();
      } else {
        quietHaptic.error();
        say(`Upload failed. ${outcome.error}`);
      }
    } catch (e) {
      quietHaptic.error();
      say(`Upload failed. ${errorText(e)}`);
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }

  const label = selected ? ACTIVITY_LABELS[selected] : null;
  const statusWord =
    recorder.phase === "recording"
      ? "Recording"
      : recorder.phase === "idle"
      ? "Idle"
      : "Working";

  const startHint = !selected
    ? "Choose an activity first."
    : hasUnsaved
    ? "Save or discard the unsaved recording first."
    : `Starts recording accelerometer and gyroscope data labeled ${label}.`;

  const liveSummary =
    `Status ${statusWord}. Activity ${label ?? "none selected"}. ` +
    `Elapsed ${formatClock(recorder.live.elapsedMs)}. ` +
    `${total} samples: ${recorder.live.accelerometer} accelerometer, ${recorder.live.gyroscope} gyroscope.`;

  const lastSavedName = result?.kind === "saved" ? result.stored.csvName : null;
  const olderHistory = history.filter((h) => h.csvName !== lastSavedName);

  return (
    <View>
      <Text style={styles.subheading}>1. Choose the activity to record</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Activity to record"
        style={styles.activityGrid}
      >
        {ACTIVITIES.map((activity) => {
          const isSelected = selected === activity;
          const disabled = !isIdle;
          const name = ACTIVITY_LABELS[activity];
          const isHazard = activity === "hazard";
          return (
            <TouchableOpacity
              key={activity}
              accessibilityRole="radio"
              accessibilityLabel={isHazard ? "Hazard: simulated falls and trips" : name}
              accessibilityHint={
                disabled
                  ? "Locked while recording."
                  : isHazard
                  ? "Select hazard as the label for simulated falls, trips, drops, and tosses."
                  : `Select ${name.toLowerCase()} as the label for the next recording.`
              }
              accessibilityState={{ selected: isSelected, disabled, checked: isSelected }}
              disabled={disabled}
              onPress={() => setSelected(activity)}
              activeOpacity={0.75}
              style={[
                styles.activityButton,
                isSelected && styles.activityButtonSelected,
                disabled && !isSelected && styles.activityButtonDisabled,
              ]}
            >
              {/* The mark and the word "selected" mean state is not color-only. */}
              <Text style={[styles.activityText, isSelected && styles.activityTextSelected]}>
                {isSelected ? "✓ " : ""}
                {name}
              </Text>
              {isSelected ? (
                <Text style={styles.activitySub}>
                  {isHazard ? "Selected (Falls/Trips)" : "Selected"}
                </Text>
              ) : isHazard ? (
                <Text style={styles.activitySubMuted}>Falls / Trips</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View accessible style={styles.banner}>
        <Text style={styles.bannerText}>
          {label
            ? `Selected activity: ${label}${selected === "hazard" ? " (simulated falls, trips, drops)" : ""}${isRecording ? " (locked while recording)" : ""}`
            : "No activity selected. Choose one above before recording."}
        </Text>
      </View>

      <Text style={styles.subheading}>2. Record</Text>
      <ActionButton
        label="Start Recording"
        hint={startHint}
        onPress={onStart}
        disabled={!selected || !isIdle || hasUnsaved}
        primary
      />
      <ActionButton
        label="Stop Recording"
        hint="Stops recording and saves the data to this device."
        onPress={onStop}
        disabled={!isRecording}
      />

      {startError ? (
        <View accessible accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>Error: {startError}</Text>
        </View>
      ) : null}

      <View accessible accessibilityLabel={liveSummary} style={styles.card}>
        <Text style={styles.cardTitle}>Current recording</Text>
        <Text style={styles.line}>Status: {statusWord}</Text>
        <Text style={styles.line}>Activity: {label ?? "None selected"}</Text>
        <Text style={styles.line}>Elapsed: {formatClock(recorder.live.elapsedMs)}</Text>
        <Text style={styles.line}>Total samples: {total}</Text>
        <Text style={styles.line}>Accelerometer samples: {recorder.live.accelerometer}</Text>
        <Text style={styles.line}>Gyroscope samples: {recorder.live.gyroscope}</Text>
        {recorder.live.sensorWarning ? (
          <Text style={styles.warnText}>Warning: {recorder.live.sensorWarning}</Text>
        ) : null}
      </View>

      <Text style={styles.subheading}>3. Last recording</Text>
      {result === null ? (
        <View accessible style={styles.card}>
          <Text style={styles.line}>No recording yet in this session.</Text>
        </View>
      ) : result.kind === "empty" ? (
        <View accessible style={styles.card}>
          <Text style={styles.cardTitle}>Empty recording. Nothing saved.</Text>
          <Text style={styles.line}>
            No sensor data arrived. Check that motion sensors work on this device, then try
            again.
          </Text>
          {result.metadata.warnings.map((w) => (
            <Text key={w} style={styles.warnText}>Warning: {w}</Text>
          ))}
        </View>
      ) : result.kind === "unsaved" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>NOT SAVED (held in memory only)</Text>
          <Text style={styles.errorText}>Error: {result.error}</Text>
          <MetadataLines metadata={result.metadata} />
          <ActionButton
            label="Retry Save"
            hint="Tries again to write this recording to the device."
            onPress={onRetrySave}
            primary
          />
          <ActionButton
            label="Discard Unsaved Recording"
            hint="Permanently removes this unsaved data. Asks for confirmation."
            onPress={onDiscard}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {result.stored.metadata.status === "interrupted"
              ? "SAVED, INTERRUPTED (may be incomplete)"
              : "SAVED to this device"}
          </Text>
          <MetadataLines metadata={result.stored.metadata} />
          <Text style={styles.line}>File: {result.stored.csvName}</Text>
          <RecordingActions
            rec={result.stored}
            busy={busy}
            canUpload={Boolean(apiUrl)}
            onShare={onShare}
            onUpload={onUpload}
          />
        </View>
      )}

      <Text style={styles.subheading}>Saved recordings</Text>
      {olderHistory.length === 0 ? (
        <View accessible style={styles.card}>
          <Text style={styles.line}>No other saved recordings on this device.</Text>
        </View>
      ) : (
        olderHistory.slice(0, HISTORY_SHOWN).map((rec) => (
          <View key={rec.csvName} style={styles.card}>
            <Text style={styles.cardTitle}>
              {ACTIVITY_LABELS[rec.metadata.activity]}, {formatClock(rec.metadata.duration_ms)}
            </Text>
            <Text style={styles.line}>
              {rec.metadata.total_samples} samples ·{" "}
              {new Date(rec.metadata.started_at_ms).toLocaleString()}
            </Text>
            {rec.metadata.status === "interrupted" ? (
              <Text style={styles.warnText}>Interrupted: may be incomplete</Text>
            ) : null}
            <RecordingActions
              rec={rec}
              busy={busy}
              canUpload={Boolean(apiUrl)}
              onShare={onShare}
              onUpload={onUpload}
            />
          </View>
        ))
      )}
      {olderHistory.length > HISTORY_SHOWN ? (
        <Text style={styles.small}>
          Showing the {HISTORY_SHOWN} newest of {olderHistory.length} other recordings.
        </Text>
      ) : null}
      {unreadable > 0 ? (
        <Text style={styles.warnText}>
          {unreadable} saved {unreadable === 1 ? "entry" : "entries"} could not be read and{" "}
          {unreadable === 1 ? "is" : "are"} not listed.
        </Text>
      ) : null}
    </View>
  );
}

function MetadataLines({ metadata }: { metadata: SessionMetadata }) {
  return (
    <View>
      <Text style={styles.line}>Activity: {ACTIVITY_LABELS[metadata.activity]}</Text>
      <Text style={styles.line}>Session ID: {metadata.session_id}</Text>
      <Text style={styles.line}>Duration: {formatClock(metadata.duration_ms)}</Text>
      <Text style={styles.line}>
        Accelerometer: {metadata.accelerometer.samples} samples,{" "}
        {hz(metadata.accelerometer.observed_hz)}
      </Text>
      <Text style={styles.line}>
        Gyroscope: {metadata.gyroscope.samples} samples, {hz(metadata.gyroscope.observed_hz)}
      </Text>
      {metadata.warnings.map((w) => (
        <Text key={w} style={styles.warnText}>Warning: {w}</Text>
      ))}
    </View>
  );
}

function RecordingActions({
  rec,
  busy,
  canUpload,
  onShare,
  onUpload,
}: {
  rec: StoredRecording;
  busy: Busy;
  canUpload: boolean;
  onShare: (r: StoredRecording) => void;
  onUpload: (r: StoredRecording) => void;
}) {
  const id = rec.metadata.session_id;
  const thisBusy = busy?.id === id ? busy.kind : null;
  const uploaded = rec.upload !== null;
  return (
    <View style={styles.actions}>
      <Text style={styles.line}>
        Backend: {uploaded ? `Uploaded (${rec.upload?.recording_id})` : "Not uploaded"}
      </Text>
      <ActionButton
        label={thisBusy === "share" ? "Sharing..." : "Share CSV File"}
        hint="Opens the share sheet so you can save the file to Files or send it to your computer."
        onPress={() => onShare(rec)}
        disabled={busy !== null}
      />
      <ActionButton
        label={
          thisBusy === "upload"
            ? "Uploading..."
            : uploaded
            ? "Upload Again"
            : "Upload to Backend"
        }
        hint={
          canUpload
            ? "Sends this recording to the backend. Nothing is uploaded unless you tap this."
            : "Backend address is not configured."
        }
        onPress={() => onUpload(rec)}
        disabled={busy !== null || !canUpload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  subheading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
    marginTop: 12,
    marginBottom: 10,
  },
  activityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  activityButton: {
    width: "48.5%",
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    marginBottom: 12,
  },
  activityButtonSelected: {
    borderWidth: 4,
    borderColor: "#14213D",
    backgroundColor: "#E8F0FE",
  },
  activityButtonDisabled: {
    backgroundColor: "#E2E8F0",
    borderColor: "#CBD5E1",
  },
  activityText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
    textAlign: "center",
  },
  activityTextSelected: {
    fontWeight: "800",
  },
  activitySub: {
    fontSize: 12,
    fontWeight: "700",
    color: "#14213D",
    marginTop: 2,
  },
  activitySubMuted: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  banner: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  bannerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#14213D",
    marginBottom: 6,
  },
  line: {
    fontSize: 15,
    color: "#334155",
    marginTop: 4,
  },
  small: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 8,
  },
  warnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#7A3E00",
    marginTop: 6,
  },
  errorBox: {
    borderWidth: 2,
    borderColor: "#9B1C1C",
    backgroundColor: "#FDECEC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#9B1C1C",
    marginTop: 4,
  },
  actions: {
    marginTop: 12,
  },
});
