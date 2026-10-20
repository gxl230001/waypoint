import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Accelerometer, Gyroscope } from "expo-sensors";

type Subscription = { remove: () => void };

export type UseFallDetectorOptions = {
  apiUrl?: string;
  onFall?: (probability: number) => void;
};

export type FallDetectorState = {
  running: boolean;
  probability: number | null;
  lastError: string | null;
  start: () => Promise<{ ok: boolean; error?: string }>;
  stop: () => void;
};

const UPDATE_INTERVAL_MS = 20; // ~50 Hz, rate the model was trained at
const PREDICT_INTERVAL_MS = 500;
const WINDOW_SIZE = 100;
const PREDICT_TIMEOUT_MS = 2000;
const COOLDOWN_MS = 5000;
// Setting a phone down or a bump in a pocket can score above the backend's own
// 0.5 threshold, so the app is stricter: the score must be high, and stay high
// for a second prediction in a row (a real fall keeps the impact in the window).
export const FALL_PROBABILITY = 0.9;
export const FALL_CONSECUTIVE_WINDOWS = 2;

export function useFallDetector(
  optionsOrUrl?: string | UseFallDetectorOptions,
  maybeOnFall?: (probability: number) => void
): FallDetectorState {
  const options: UseFallDetectorOptions =
    typeof optionsOrUrl === "string"
      ? { apiUrl: optionsOrUrl, onFall: maybeOnFall }
      : optionsOrUrl ?? {};

  const { apiUrl, onFall } = options;

  const [running, setRunning] = useState(false);
  const [probability, setProbability] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const apiUrlRef = useRef(apiUrl);
  apiUrlRef.current = apiUrl;

  const onFallRef = useRef(onFall);
  onFallRef.current = onFall;

  const accSub = useRef<Subscription | null>(null);
  const gyroSub = useRef<Subscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bufferRef = useRef<number[][]>([]);
  const latestGyroRef = useRef<[number, number, number] | null>(null);
  const inFlightRef = useRef(false);
  const lastFallAlertTimeRef = useRef(0);
  const highScoresInARowRef = useRef(0);

  const removeSubscriptions = useCallback(() => {
    accSub.current?.remove();
    gyroSub.current?.remove();
    accSub.current = null;
    gyroSub.current = null;
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (mountedRef.current) {
      setRunning(false);
    }
    removeSubscriptions();
    stopInterval();
    bufferRef.current = [];
    latestGyroRef.current = null;
    inFlightRef.current = false;
    highScoresInARowRef.current = 0;
  }, [removeSubscriptions, stopInterval]);

  const tickPredict = useCallback(async () => {
    if (!runningRef.current || inFlightRef.current || bufferRef.current.length < WINDOW_SIZE) {
      return;
    }

    const currentApiUrl = apiUrlRef.current;
    if (!currentApiUrl) {
      if (mountedRef.current) {
        setLastError("Missing backend API URL");
      }
      return;
    }

    // Capture the latest 100 rows without mutating buffer
    const window = bufferRef.current.slice(-WINDOW_SIZE);
    if (window.length !== WINDOW_SIZE) return;

    inFlightRef.current = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREDICT_TIMEOUT_MS);

    try {
      const url = `${currentApiUrl.replace(/\/+$/, "")}/api/v1/fall/predict`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        probability: number;
        fall: boolean;
        threshold: number;
      };

      if (mountedRef.current && runningRef.current) {
        setProbability(data.probability);
        setLastError(null);
      }

      highScoresInARowRef.current =
        data.probability >= FALL_PROBABILITY ? highScoresInARowRef.current + 1 : 0;

      if (highScoresInARowRef.current >= FALL_CONSECUTIVE_WINDOWS) {
        const now = Date.now();
        if (now - lastFallAlertTimeRef.current >= COOLDOWN_MS) {
          lastFallAlertTimeRef.current = now;
          onFallRef.current?.(data.probability);
        }
      }
    } catch (err: any) {
      if (mountedRef.current && runningRef.current) {
        const message =
          err?.name === "AbortError"
            ? "Fall prediction request timed out"
            : err instanceof Error
            ? err.message
            : "Fall prediction failed";
        setLastError(message);
      }
    } finally {
      clearTimeout(timeoutId);
      inFlightRef.current = false;
    }
  }, []);

  const start = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (runningRef.current) {
      return { ok: true };
    }

    if (!apiUrlRef.current) {
      const err = "Configure EXPO_PUBLIC_API_URL before starting fall detection.";
      if (mountedRef.current) {
        setLastError(err);
      }
      return { ok: false, error: err };
    }

    if (mountedRef.current) {
      setLastError(null);
    }

    try {
      const [accAvailable, gyroAvailable] = await Promise.all([
        Accelerometer.isAvailableAsync(),
        Gyroscope.isAvailableAsync(),
      ]);

      if (!accAvailable || !gyroAvailable) {
        const err =
          !accAvailable && !gyroAvailable
            ? "Accelerometer and gyroscope are not available on this device."
            : !accAvailable
            ? "The accelerometer is not available on this device."
            : "The gyroscope is not available on this device.";
        if (mountedRef.current) {
          setLastError(err);
        }
        return { ok: false, error: err };
      }

      if (!mountedRef.current) return { ok: false, error: "Screen was closed." };

      removeSubscriptions();
      stopInterval();

      bufferRef.current = [];
      latestGyroRef.current = null;
      inFlightRef.current = false;

      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
      Gyroscope.setUpdateInterval(UPDATE_INTERVAL_MS);

      runningRef.current = true;
      if (mountedRef.current) {
        setRunning(true);
      }

      accSub.current = Accelerometer.addListener((reading) => {
        if (!runningRef.current || latestGyroRef.current === null) return;
        const { x, y, z } = reading;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const [gx, gy, gz] = latestGyroRef.current;
        bufferRef.current.push([x, y, z, gx, gy, gz]);
        if (bufferRef.current.length > WINDOW_SIZE) {
          bufferRef.current.shift();
        }
      });

      gyroSub.current = Gyroscope.addListener((reading) => {
        if (!runningRef.current) return;
        const { x, y, z } = reading;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        latestGyroRef.current = [x, y, z];
      });

      intervalRef.current = setInterval(() => {
        void tickPredict();
      }, PREDICT_INTERVAL_MS);

      return { ok: true };
    } catch (e: any) {
      removeSubscriptions();
      stopInterval();
      runningRef.current = false;
      if (mountedRef.current) {
        setRunning(false);
      }
      const err = e instanceof Error ? e.message : "Could not start fall detection.";
      if (mountedRef.current) {
        setLastError(err);
      }
      return { ok: false, error: err };
    }
  }, [removeSubscriptions, stopInterval, tickPredict]);

  // Stop on background
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background" && runningRef.current) {
        stop();
      }
    });
    return () => subscription.remove();
  }, [stop]);

  // Stop and cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return {
    running,
    probability,
    lastError,
    start,
    stop,
  };
}
