import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ActionButton } from "./src/components/ActionButton";
import { ViewToggle } from "./src/components/ViewToggle";
import { TrialCounters } from "./src/fall/TrialCounters";
import { useFallDetector } from "./src/fall/useFallDetector";
import {
  ImuCollectionPanel,
  type ImuSummary,
} from "./src/imu/ImuCollectionPanel";
import type { SosReason } from "./src/sos/sosMachine";
import { useSos } from "./src/sos/useSos";
import { SettingsPanel } from "./src/settings/SettingsPanel";
import { getSettings } from "./src/settings/settingsStore";

import { HomeScreen, type UserViewMode } from "./src/screens/HomeScreen";
import { HELP_TEXT, parseCommand } from "./src/voice/commands";
import { useVoiceInput } from "./src/voice/useVoiceInput";
import { routeTranscript } from "./src/voice/voiceRouter";
import { cue } from "./src/services/haptics";
import { isSpeakingOrJustSpoke, speak, stopSpeaking } from "./src/services/speech";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const DEMO_DESTINATION = "JO 4.102";
const DEMO_INSTRUCTION = "Keep walking 40 steps\nTurn left in 2 minutes";

export default function App() {
  const [screen, setScreen] = useState<"home" | "tools">("home");
  const [apiStatus, setApiStatus] = useState("Not checked");
  const [navigationActive, setNavigationActive] = useState(false);
  const [imu, setImu] = useState<ImuSummary>({
    recording: false,
    activityLabel: null,
    totalSamples: 0,
  });
  const [fallAlert, setFallAlert] = useState<{ probability: number } | null>(null);
  const [message, setMessage] = useState(
    "Welcome. Hold to chat, or start navigation."
  );

  const sosTriggerRef = useRef<(reason?: SosReason) => void>(() => {});

  const screenRef = useRef(screen);
  screenRef.current = screen;

  // SOS only exists in the user view. A fall seen while the dev tools are open
  // is a test, so it must not start the countdown.
  const handleFall = useCallback((probability: number) => {
    if (screenRef.current !== "home") return;
    setFallAlert({ probability });
    sosTriggerRef.current("fall");
  }, []);

  const sos = useSos({
    speak: (text) => {
      speak(text, "hazard", { force: true });
    },
    haptic: (kind) => {
      cue(kind === "tick" ? "straight" : kind === "warning" ? "hazard" : "confirm");
    },
    getContact: () => getSettings().emergencyContact,
  });
  sosTriggerRef.current = sos.trigger;

  const sosActive = sos.state.phase !== "idle";

  // When the SOS flow ends (cancelled, or "Done" after the demo call), go back
  // to the normal user screen (idle, or navigation if it was running).
  const sosWasActive = useRef(false);
  useEffect(() => {
    if (sosActive) {
      sosWasActive.current = true;
      return;
    }
    if (!sosWasActive.current) return;
    sosWasActive.current = false;
    setFallAlert(null);
    setMessage(
      navigationActive
        ? `Headed to ${DEMO_DESTINATION}. ${DEMO_INSTRUCTION.replace(/\n/g, ". ")}`
        : "Back to the main screen."
    );
  }, [sosActive, navigationActive]);

  // The microphone stays open for the whole app. Phrases are routed by
  // runVoiceAction, which always sees the latest state through this ref.
  const lastSosVoiceAt = useRef(0);
  const voiceHandlerRef = useRef<(text: string, isFinal: boolean) => void>(() => {});
  const voice = useVoiceInput((text, isFinal) => voiceHandlerRef.current(text, isFinal));
  const listening = voice.status === "listening";
  voiceHandlerRef.current = (text, isFinal) => {
    const action = routeTranscript(text, isFinal, {
      sosPhase: sos.state.phase,
      assistantSpeaking: isSpeakingOrJustSpoke(),
    });
    if (action === null) return;

    if (action.type === "sosReply") {
      // One utterance produces several partial results. Act once.
      const now = Date.now();
      if (now - lastSosVoiceAt.current < 1500) return;
      lastSosVoiceAt.current = now;
      if (action.reply === "confirm") sos.confirm();
      else if (action.reply === "cancel") sos.cancel();
      else sos.dismiss();
      return;
    }
    runCommand(action.command);
  };

  const fallDetector = useFallDetector({
    apiUrl: API_URL,
    onFall: handleFall,
  });

  const startFallDetection = fallDetector.start;

  // Listen for falls and trips whenever the user view is showing.
  useEffect(() => {
    if (screen === "home" && !imu.recording) {
      void startFallDetection();
    }
  }, [screen, imu.recording, startFallDetection]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const handleImuMessage = useCallback((text: string) => setMessage(text), []);
  const handleImuSummary = useCallback((summary: ImuSummary) => setImu(summary), []);

  async function checkBackend() {
    if (!API_URL) {
      setApiStatus("Missing API URL");
      setMessage("Configure EXPO_PUBLIC_API_URL in the mobile .env file.");
      return;
    }

    try {
      setApiStatus("Checking...");

      const response = await fetch(`${API_URL}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setApiStatus(data.status === "ok" ? "Connected" : "Unexpected response");
      setMessage("Backend health check completed.");
    } catch (error) {
      setApiStatus("Unavailable");
      setMessage(
        "Cannot reach the backend. Check the IP address, Wi-Fi, and server."
      );
      console.error("Backend health check failed:", error);
    }
  }

  function startNavigation() {
    setNavigationActive(true);
    const spoken = `Headed to ${DEMO_DESTINATION}. ${DEMO_INSTRUCTION.replace(/\n/g, ". ")}`;
    setMessage(spoken);
    speak(spoken, "direction");
    cue("confirm");
  }

  function stopNavigation() {
    setNavigationActive(false);
    setMessage("Navigation stopped.");
    speak("Navigation stopped.", "direction");
    cue("warning");
  }

  function testHaptics() {
    cue("straight");
    setMessage("Haptic feedback test completed.");
  }

  function announceStatus() {
    speak(message, "direction", { force: true });
  }

  function say(text: string) {
    setMessage(text);
    speak(text, "info", { force: true });
  }

  // "Hold to chat" does not take voice input. It opens the navigation view and
  // reads out the navigation details (and repeats them if already navigating).
  function handleSpeakPress() {
    cue("confirm");
    if (sosActive) return;
    if (navigationActive) announceStatus();
    else startNavigation();
  }

  // Only called while SOS is idle: during SOS the router accepts SOS replies only.
  function runCommand(command: Exclude<ReturnType<typeof parseCommand>, "unknown">) {
    switch (command) {
      case "startNavigation":
        if (!navigationActive) startNavigation();
        else say("Navigation is already running.");
        break;
      case "stopNavigation":
        if (navigationActive) stopNavigation();
        else say("Navigation is not running.");
        break;
      case "repeat":
        announceStatus();
        break;
      case "status":
        say(
          navigationActive
            ? `Headed to ${DEMO_DESTINATION}.`
            : "Navigation is stopped."
        );
        break;
      case "settings":
        setScreen("tools");
        say("Opening settings in the developer view. Say user view to return.");
        break;
      case "userView":
        setScreen("home");
        say("Back to the main screen.");
        break;
      case "sos":
        if (screen === "home") sos.trigger("voice");
        else say("SOS is only available in the user view. Say user view to go back.");
        break;
      case "cancelSos":
        say("SOS is not active.");
        break;
      case "help":
        say(HELP_TEXT);
        break;
    }
  }

  const userMode: UserViewMode = sosActive
    ? "sos"
    : navigationActive
      ? "navigating"
      : "idle";

  if (screen === "home") {
    return (
      <HomeScreen
        mode={userMode}
        destination={DEMO_DESTINATION}
        instruction={DEMO_INSTRUCTION}
        listening={listening}
        onSpeakPress={handleSpeakPress}
        onRepeatPress={announceStatus}
        onOpenDevView={() => setScreen("tools")}
        sos={sos.state}
        onSosOkay={sos.cancel}
        onSosConfirm={sos.confirm}
        onSosDismiss={sos.dismiss}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ViewToggle
        label="User view"
        hint="Switches to the simple user view with the speak button."
        onPress={() => setScreen("home")}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>ACCESSIBLE MOBILITY</Text>
        <Text style={styles.title}>Waypoint</Text>
        <Text style={styles.subtitle}>
          Your low-vision navigation MVP
        </Text>

        <View
          accessible
          accessibilityRole="summary"
          style={styles.statusCard}
        >
          <Text style={styles.sectionTitle}>System status</Text>
          <Text style={styles.statusText}>
            Backend: {apiStatus}
          </Text>
          <Text style={styles.statusText}>
            Navigation: {navigationActive ? "Active (demo)" : "Stopped"}
          </Text>
          <Text style={styles.statusText}>
            IMU recording:{" "}
            {imu.recording
              ? `Recording${imu.activityLabel ? ` (${imu.activityLabel})` : ""}`
              : "Idle"}
          </Text>
          <Text style={styles.statusText}>
            Samples collected: {imu.totalSamples}
          </Text>
          <Text style={styles.statusText}>
            Fall detection:{" "}
            {fallDetector.running
              ? `Running (p=${(fallDetector.probability ?? 0).toFixed(2)})`
              : "Stopped"}
          </Text>
        </View>

        {fallAlert && (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={styles.fallBanner}
          >
            <Text style={styles.fallBannerTitle}>FALL DETECTED</Text>
            <Text style={styles.fallBannerSubtitle}>
              Fall confidence score: {fallAlert.probability.toFixed(2)}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Fall detection</Text>
        <ActionButton
          label="Start Fall Detection"
          hint="Starts continuous fall detection model inference."
          onPress={() => {
            void fallDetector.start();
          }}
          disabled={fallDetector.running || imu.recording}
          primary
        />
        <ActionButton
          label="Stop Fall Detection"
          onPress={fallDetector.stop}
          disabled={!fallDetector.running}
        />
        <TrialCounters />

        <Text style={styles.sectionTitle}>Navigation</Text>
        <ActionButton
          label="Start Demo Navigation"
          hint="Starts a demonstration. This does not provide real directions."
          onPress={startNavigation}
          disabled={navigationActive}
          primary
        />
        <ActionButton
          label="Stop Navigation"
          onPress={stopNavigation}
          disabled={!navigationActive}
        />

        <Text style={styles.sectionTitle}>IMU data collection</Text>
        <ImuCollectionPanel
          apiUrl={API_URL}
          onMessage={handleImuMessage}
          onSummaryChange={handleImuSummary}
        />

        <Text style={styles.sectionTitle}>Device and backend</Text>
        <ActionButton
          label="Test Haptic Feedback"
          onPress={testHaptics}
        />
        <ActionButton
          label="Check Backend Connection"
          onPress={checkBackend}
        />
        <ActionButton
          label="Read Current Status Aloud"
          onPress={announceStatus}
        />

        <Text style={styles.sectionTitle}>Settings</Text>
        <SettingsPanel />

        <View
          accessible
          accessibilityLiveRegion="polite"
          style={styles.messageCard}
        >
          <Text style={styles.sectionTitle}>Latest update</Text>
          <Text style={styles.message}>{message}</Text>
        </View>

        <Text style={styles.disclaimer}>
          Prototype only. No real route guidance or obstacle detection is
          available yet. Sensor recordings are experimental research data,
          saved on this device as CSV files. They are uploaded only when you
          tap Upload to Backend.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#475569",
    marginTop: 16,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#14213D",
    marginTop: 6,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    marginTop: 4,
    marginBottom: 24,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#14213D",
    marginBottom: 12,
    marginTop: 8,
  },
  statusText: {
    fontSize: 16,
    color: "#334155",
    marginTop: 6,
  },
  messageCard: {
    marginTop: 16,
    backgroundColor: "#E8F0FE",
    borderRadius: 16,
    padding: 16,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: "#14213D",
  },
  disclaimer: {
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
    marginTop: 20,
  },
  fallBanner: {
    backgroundColor: "#FDECEC",
    borderWidth: 2,
    borderColor: "#9B1C1C",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  fallBannerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#9B1C1C",
    textAlign: "center",
  },
  fallBannerSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9B1C1C",
    textAlign: "center",
    marginTop: 4,
  },
});
