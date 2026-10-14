import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { Pedometer } from "expo-sensors";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { RouteSegmenter } from "./core";
import { saveRoute } from "./storage";
import type { Route, SaveRouteResult } from "./types";

const KEEP_AWAKE_TAG = "waypoint-route-recording";

export interface LiveRecorderReadout {
  steps: number;
  headingDeg: number;
  accuracy: number;
  legsCount: number;
}

export interface UseRouteRecorderResult {
  isRecording: boolean;
  isCalibrated: boolean;
  calibrationMessage: string | null;
  permissionError: string | null;
  live: LiveRecorderReadout;
  lastSavedRoute: Route | null;
  saveError: string | null;
  startRecording: (name: string) => Promise<{ ok: boolean; error?: string }>;
  markTurn: () => void;
  markLandmark: (label: string) => void;
  markEnd: () => Promise<SaveRouteResult | null>;
  cancelRecording: () => void;
}

export function useRouteRecorder(
  onRouteSaved?: (route: Route) => void
): UseRouteRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveRecorderReadout>({
    steps: 0,
    headingDeg: 0,
    accuracy: 0,
    legsCount: 1,
  });
  const [lastSavedRoute, setLastSavedRoute] = useState<Route | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const segmenterRef = useRef<RouteSegmenter | null>(null);
  const routeNameRef = useRef<string>("My Route");
  const isRecordingRef = useRef(false);
  const liveHeadingRef = useRef<number>(0);
  const lastCumulativeStepsRef = useRef<number>(0);
  const totalRecordedStepsRef = useRef<number>(0);

  const headingSubRef = useRef<{ remove: () => void } | null>(null);
  const pedometerSubRef = useRef<{ remove: () => void } | null>(null);
  const onRouteSavedRef = useRef(onRouteSaved);
  onRouteSavedRef.current = onRouteSaved;

  const speak = (text: string) => {
    try {
      Speech.stop();
      Speech.speak(text);
    } catch {
      /* ignore speech error */
    }
  };

  const haptic = (type: Haptics.NotificationFeedbackType) => {
    try {
      void Haptics.notificationAsync(type);
    } catch {
      /* ignore haptic error */
    }
  };

  // Setup live compass listener (runs always while panel is active so accuracy is known)
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let active = true;

    async function initCompass() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== "granted") {
          setPermissionError("Location permission is required for compass heading.");
          return;
        }

        sub = await Location.watchHeadingAsync((headingData) => {
          if (!active) return;
          const magHeading = Math.round(headingData.magHeading);
          const acc = headingData.accuracy;
          liveHeadingRef.current = magHeading;

          // Accuracy on iOS: > 0 means calibrated; 0 or -1 means uncalibrated / interference
          const calibrated = acc > 0;
          setIsCalibrated(calibrated);
          if (!calibrated) {
            setCalibrationMessage(
              "Wave the phone in a figure 8 to calibrate the compass."
            );
          } else {
            setCalibrationMessage(null);
          }

          setLive((prev) => ({
            ...prev,
            headingDeg: magHeading,
            accuracy: acc,
          }));
        });
        headingSubRef.current = sub;
      } catch (err) {
        if (active) {
          setPermissionError(
            err instanceof Error ? err.message : "Failed to access compass heading."
          );
        }
      }
    }

    void initCompass();

    return () => {
      active = false;
      sub?.remove();
      headingSubRef.current = null;
    };
  }, []);

  const releaseKeepAwake = () => {
    try {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    } catch {
      /* ignore */
    }
  };

  const stopSensors = () => {
    pedometerSubRef.current?.remove();
    pedometerSubRef.current = null;
    releaseKeepAwake();
  };

  const finalizeAndSave = useCallback(
    (isInterrupted = false): SaveRouteResult | null => {
      const segmenter = segmenterRef.current;
      if (!segmenter || !isRecordingRef.current) return null;

      stopSensors();
      isRecordingRef.current = false;
      setIsRecording(false);

      const { legs, totalSteps } = segmenter.finish();
      const timestamp = new Date().toISOString();
      const id = `route_${Date.now()}`;

      const newRoute: Route = {
        id,
        name: routeNameRef.current.trim() || `Route ${new Date().toLocaleTimeString()}`,
        createdAt: timestamp,
        version: 1,
        legs,
        totalSteps,
        notes: isInterrupted
          ? "Interrupted: app moved to background during recording."
          : undefined,
      };

      const result = saveRoute(newRoute);
      if (result.ok) {
        setLastSavedRoute(result.route);
        setSaveError(null);
        onRouteSavedRef.current?.(result.route);
        if (isInterrupted) {
          speak("Recording interrupted and saved.");
          haptic(Haptics.NotificationFeedbackType.Warning);
        } else {
          speak(`Route saved: ${result.route.name}, ${totalSteps} steps in ${legs.length} legs.`);
          haptic(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        setSaveError(result.error);
        speak(`Failed to save route: ${result.error}`);
        haptic(Haptics.NotificationFeedbackType.Error);
      }

      segmenterRef.current = null;
      return result;
    },
    []
  );

  const startRecording = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    if (isRecordingRef.current) {
      return { ok: false, error: "Recording is already active." };
    }

    // Check pedometer availability & permission
    const isAvail = await Pedometer.isAvailableAsync();
    if (!isAvail) {
      const err = "Pedometer is not available on this device.";
      setPermissionError(err);
      speak(err);
      return { ok: false, error: err };
    }

    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) {
      const err = "Motion permission is required to count steps.";
      setPermissionError(err);
      speak(err);
      return { ok: false, error: err };
    }

    if (!isCalibrated) {
      const warn = "Wave the phone in a figure 8 to calibrate the compass first.";
      setCalibrationMessage(warn);
      speak(warn);
      return { ok: false, error: warn };
    }

    // Initialize recording session
    routeNameRef.current = name.trim() || `Route ${new Date().toLocaleTimeString()}`;
    segmenterRef.current = new RouteSegmenter();
    lastCumulativeStepsRef.current = 0;
    totalRecordedStepsRef.current = 0;
    isRecordingRef.current = true;
    setIsRecording(true);
    setSaveError(null);

    // Keep screen awake
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    // Subscribe to pedometer steps
    pedometerSubRef.current = Pedometer.watchStepCount((result) => {
      if (!isRecordingRef.current || !segmenterRef.current) return;

      const currentCumulative = result.steps;
      let delta = currentCumulative - lastCumulativeStepsRef.current;
      if (delta <= 0) return;

      lastCumulativeStepsRef.current = currentCumulative;
      totalRecordedStepsRef.current += delta;

      const heading = liveHeadingRef.current;
      segmenterRef.current.addStep(delta, heading, Date.now());

      setLive((prev) => ({
        ...prev,
        steps: totalRecordedStepsRef.current,
      }));
    });

    setLive({
      steps: 0,
      headingDeg: liveHeadingRef.current,
      accuracy: 1,
      legsCount: 1,
    });

    speak(`Recording route ${routeNameRef.current}. Walk normally holding the phone upright.`);
    haptic(Haptics.NotificationFeedbackType.Success);

    return { ok: true };
  };

  const markTurn = () => {
    if (!isRecordingRef.current || !segmenterRef.current) return;
    segmenterRef.current.markTurn(liveHeadingRef.current);
    speak("Turn marked.");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const markLandmark = (label: string) => {
    if (!isRecordingRef.current || !segmenterRef.current) return;
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    segmenterRef.current.markLandmark(cleanLabel);
    speak(`Landmark marked: ${cleanLabel}`);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const markEnd = async (): Promise<SaveRouteResult | null> => {
    if (!isRecordingRef.current) return null;
    return finalizeAndSave(false);
  };

  const cancelRecording = () => {
    if (!isRecordingRef.current) return;
    stopSensors();
    isRecordingRef.current = false;
    setIsRecording(false);
    segmenterRef.current = null;
    speak("Route recording cancelled.");
    haptic(Haptics.NotificationFeedbackType.Warning);
  };

  // Backgrounding safety: save as interrupted like IMU recorder
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" && isRecordingRef.current) {
        finalizeAndSave(true);
      }
    });
    return () => subscription.remove();
  }, [finalizeAndSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        finalizeAndSave(true);
      }
      stopSensors();
    };
  }, [finalizeAndSave]);

  return {
    isRecording,
    isCalibrated,
    calibrationMessage,
    permissionError,
    live,
    lastSavedRoute,
    saveError,
    startRecording,
    markTurn,
    markLandmark,
    markEnd,
    cancelRecording,
  };
}
