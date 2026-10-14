import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { buildSessionMetadata, generateSessionId, REQUESTED_INTERVAL_MS } from "./stats";
import type {
  Activity,
  EndReason,
  FinishedRecording,
  ImuSample,
  SensorName,
  SessionStatus,
} from "./types";

/** idle -> starting -> recording -> stopping -> idle. Any other transition is ignored. */
export type RecorderPhase = "idle" | "starting" | "recording" | "stopping";

export type LiveStats = {
  elapsedMs: number;
  accelerometer: number;
  gyroscope: number;
  /** Set when a sensor has produced nothing, or stopped producing, data. */
  sensorWarning: string | null;
};

export type StartResult = { ok: true } | { ok: false; error: string };

const UI_TICK_MS = 250;
const KEEP_AWAKE_TAG = "waypoint-imu-recording";
const NO_DATA_AFTER_MS = 2000;
const STALL_AFTER_MS = 1500;

const EMPTY_LIVE: LiveStats = {
  elapsedMs: 0,
  accelerometer: 0,
  gyroscope: 0,
  sensorWarning: null,
};

type Subscription = { remove: () => void };

type ActiveSession = {
  id: string;
  activity: Activity;
  /** performance.now() at start. Monotonic: unaffected by wall-clock changes. */
  startPerf: number;
  /** Date.now() at start. Used only to anchor timestamp_ms. */
  startWall: number;
  samples: ImuSample[];
  accCount: number;
  gyroCount: number;
  invalid: number;
  lastAccPerf: number;
  lastGyroPerf: number;
};

type RawReading = { x: number; y: number; z: number; timestamp?: number };

/**
 * Captures accelerometer + gyroscope into one in-memory session.
 *
 * Timing: elapsed_ms = performance.now() - startPerf, taken as the first line
 * of each callback. timestamp_ms = startWall + elapsed_ms, so it is a wall-clock
 * anchored timestamp that cannot jump if the clock is changed mid-session.
 * The JS callback time includes bridge latency and can be bursty; the native
 * event time is stored separately as sensor_timestamp_s.
 *
 * The raw sample array lives in a ref. React state only carries a small
 * summary refreshed every UI_TICK_MS, and every sample is kept.
 */
export function useImuRecorder(onFinished: (result: FinishedRecording) => void) {
  const [phase, setPhaseState] = useState<RecorderPhase>("idle");
  const [live, setLive] = useState<LiveStats>(EMPTY_LIVE);

  const phaseRef = useRef<RecorderPhase>("idle");
  const sessionRef = useRef<ActiveSession | null>(null);
  const accSub = useRef<Subscription | null>(null);
  const gyroSub = useRef<Subscription | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const setPhase = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhaseState(next);
  }, []);

  const removeSubscriptions = useCallback(() => {
    accSub.current?.remove();
    gyroSub.current?.remove();
    accSub.current = null;
    gyroSub.current = null;
  }, []);

  const stopTick = useCallback(() => {
    if (tickTimer.current !== null) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  const releaseKeepAwake = useCallback(() => {
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      /* not fatal */
    }
  }, []);

  const finalize = useCallback(
    (status: SessionStatus, endReason: EndReason) => {
      const session = sessionRef.current;
      if (!session || phaseRef.current === "stopping") return;
      setPhase("stopping");

      const endPerf = performance.now();
      removeSubscriptions();
      stopTick();
      releaseKeepAwake();
      sessionRef.current = null;

      const metadata = buildSessionMetadata({
        sessionId: session.id,
        activity: session.activity,
        status,
        endReason,
        startedAtWallMs: session.startWall,
        durationMs: endPerf - session.startPerf,
        samples: session.samples,
        invalidReadings: session.invalid,
        platformOs: Platform.OS,
      });

      setPhase("idle");
      onFinishedRef.current({ metadata, samples: session.samples });
    },
    [releaseKeepAwake, removeSubscriptions, setPhase, stopTick]
  );
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;

  const makeListener = useCallback(
    (sensor: SensorName) => (reading: RawReading) => {
      const now = performance.now(); // first thing: the callback time
      const session = sessionRef.current;
      if (!session || phaseRef.current !== "recording") return;

      const { x, y, z } = reading;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        session.invalid += 1; // counted and reported, never silently lost
        return;
      }

      const elapsedMs = now - session.startPerf;
      session.samples.push({
        timestampMs: session.startWall + elapsedMs,
        elapsedMs,
        sensor,
        x,
        y,
        z,
        sensorTimestampS:
          typeof reading.timestamp === "number" && Number.isFinite(reading.timestamp)
            ? reading.timestamp
            : null,
      });

      if (sensor === "accelerometer") {
        session.accCount += 1;
        session.lastAccPerf = now;
      } else {
        session.gyroCount += 1;
        session.lastGyroPerf = now;
      }
    },
    []
  );

  const start = useCallback(
    async (activity: Activity): Promise<StartResult> => {
      if (phaseRef.current !== "idle") {
        return { ok: false, error: "A recording is already in progress." };
      }
      setPhase("starting");

      try {
        const [accAvailable, gyroAvailable] = await Promise.all([
          Accelerometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync(),
        ]);
        if (!accAvailable || !gyroAvailable) {
          throw new Error(
            !accAvailable && !gyroAvailable
              ? "Accelerometer and gyroscope are not available on this device."
              : !accAvailable
              ? "The accelerometer is not available on this device."
              : "The gyroscope is not available on this device."
          );
        }
        if (!mountedRef.current) throw new Error("The screen was closed.");

        // Defensive: never allow a second set of listeners.
        removeSubscriptions();

        Accelerometer.setUpdateInterval(REQUESTED_INTERVAL_MS);
        Gyroscope.setUpdateInterval(REQUESTED_INTERVAL_MS);

        const startPerf = performance.now();
        const startWall = Date.now();
        sessionRef.current = {
          id: generateSessionId(activity, new Date(startWall)),
          activity,
          startPerf,
          startWall,
          samples: [],
          accCount: 0,
          gyroCount: 0,
          invalid: 0,
          lastAccPerf: startPerf,
          lastGyroPerf: startPerf,
        };
        phaseRef.current = "recording";

        accSub.current = Accelerometer.addListener(makeListener("accelerometer"));
        gyroSub.current = Gyroscope.addListener(makeListener("gyroscope"));

        // Keep the screen from auto-locking, which would interrupt the session.
        activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

        stopTick();
        tickTimer.current = setInterval(() => {
          const s = sessionRef.current;
          if (!s) return;
          const now = performance.now();
          const elapsed = now - s.startPerf;
          let warning: string | null = null;
          if (elapsed > NO_DATA_AFTER_MS) {
            if (s.accCount === 0) warning = "No accelerometer data received yet.";
            else if (s.gyroCount === 0) warning = "No gyroscope data received yet.";
            else if (now - s.lastAccPerf > STALL_AFTER_MS)
              warning = "Accelerometer data stopped arriving.";
            else if (now - s.lastGyroPerf > STALL_AFTER_MS)
              warning = "Gyroscope data stopped arriving.";
          }
          if (mountedRef.current) {
            setLive({
              elapsedMs: elapsed,
              accelerometer: s.accCount,
              gyroscope: s.gyroCount,
              sensorWarning: warning,
            });
          }
        }, UI_TICK_MS);

        setLive(EMPTY_LIVE);
        setPhase("recording");
        return { ok: true };
      } catch (e) {
        removeSubscriptions();
        stopTick();
        releaseKeepAwake();
        sessionRef.current = null;
        setPhase("idle");
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not start sensor recording.",
        };
      }
    },
    [makeListener, releaseKeepAwake, removeSubscriptions, setPhase, stopTick]
  );

  const stop = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    finalize("completed", "user_stopped");
  }, [finalize]);

  // Moving to the background suspends sensor delivery on iOS, so the session
  // is ended and flagged as interrupted instead of silently continuing.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background" && phaseRef.current === "recording") {
        finalizeRef.current("interrupted", "app_backgrounded");
      }
    });
    return () => subscription.remove();
  }, []);

  // Unmount: never leak subscriptions. A running session is finalized and
  // handed to onFinished (which saves synchronously) rather than discarded.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (phaseRef.current === "recording") {
        finalizeRef.current("interrupted", "app_unmounted");
      }
      removeSubscriptions();
      stopTick();
      releaseKeepAwake();
    };
  }, [releaseKeepAwake, removeSubscriptions, stopTick]);

  return { phase, live, start, stop };
}
