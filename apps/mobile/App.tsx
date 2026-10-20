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
import { SosModal } from "./src/sos/SosModal";
import type { SosReason } from "./src/sos/sosMachine";
import { useSos } from "./src/sos/useSos";
import { SettingsPanel } from "./src/settings/SettingsPanel";
import { getSettings } from "./src/settings/settingsStore";

import { HomeScreen, type UserViewMode } from "./src/screens/HomeScreen";
import { HELP_TEXT, parseCommand } from "./src/voice/commands";
import { unavailableRecognizer, type VoiceRecognizer } from "./src/voice/recognizer";
import { cue } from "./src/services/haptics";
import { speak, stopSpeaking } from "./src/services/speech";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const DEMO_DESTINATION = "JO 4.102";
const DEMO_INSTRUCTION = "Keep walking 40 steps\nTurn left in 2 minutes";

// Replace with a real recognizer once a development build includes speech
// recognition. See src/voice/recognizer.ts.
const recognizer: VoiceRecognizer = unavailableRecognizer;

export default function App() {
  const [screen, setScreen] = useState<"home" | "tools">("home");
  const [listening, setListening] = useState(false);
  const [apiStatus, setApiStatus] = useState("Not checked");
  const [navigationActive, setNavigationActive] = useState(false);
  const [imu, setImu] = useState<ImuSummary>({
    recording: false,
    activityLabel: null,
    totalSamples: 0,
  });
  const [fallAlert, setFallAlert] = useState<{ probability: number } | null>(null);
  const [message, setMessage] = useState(
    "Welcome. Tap to chat, or start navigation."
  );

  const sosTriggerRef = useRef<(reason?: SosReason) => void>(() => {});

  const handleFall = useCallback((probability: number) => {
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

  // When the SOS flow ends (cancelled, or "Done" after the demo call), drop
  // back to the user view so the person is not left on the developer tools.
  const sosWasActive = useRef(false);
  useEffect(() => {
    if (sosActive) {
      sosWasActive.current = true;
      return;
    }
    if (!sosWasActive.current) return;
    sosWasActive.current = false;
    setScreen("home");
    setFallAlert(null);
    setMessage(
      navigationActive
        ? `Headed to ${DEMO_DESTINATION}. ${DEMO_INSTRUCTION.replace(/\n/g, ". ")}`
        : "Back to the main screen."
    );
  }, [sosActive, navigationActive]);

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

  function cancelOrDismissSos() {
    if (sos.state.phase === "called") sos.dismiss();
    else sos.cancel();
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

  async function handleSpeakPress() {
    if (listening) return;
    cue("confirm");

    if (!recognizer.isAvailable()) {
      say(
        "Voice input needs a development build and is not available yet. " +
          "Switch to dev view to use the buttons."
      );
      return;
    }

    setListening(true);
    try {
      const heard = await recognizer.listen();
      if (heard === null) {
        say("I did not hear anything. Tap to speak and try again.");
        return;
      }
      runCommand(parseCommand(heard));
    } catch (error) {
      console.error("Voice input failed:", error);
      say("Voice input failed. Please try again.");
    } finally {
      setListening(false);
    }
  }

  function runCommand(command: ReturnType<typeof parseCommand>) {
    switch (command) {
      case "startNavigation":
        if (sosActive) {
          say("SOS is active. Say I am okay to cancel it first.");
          break;
        }
        if (!navigationActive) startNavigation();
        else say("Navigation is already running.");
        break;
      case "stopNavigation":
        if (sosActive) {
          cancelOrDismissSos();
          break;
        }
        if (navigationActive) stopNavigation();
        else say("Navigation is not running.");
        break;
      case "repeat":
        announceStatus();
        break;
      case "status":
        if (sosActive) {
          say("SOS is active.");
          break;
        }
        say(
          navigationActive
            ? `Headed to ${DEMO_DESTINATION}.`
            : "Navigation is stopped."
        );
        break;
      case "settings":
        setScreen("tools");
        break;
      case "sos":
        sos.trigger("voice");
        break;
      case "cancelSos":
        if (sosActive) cancelOrDismissSos();
        else say("SOS is not active.");
        break;
      case "help":
        say(HELP_TEXT);
        break;
      default:
        say("Sorry, I did not understand. Say help to hear what you can say.");
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
        onSpeakPress={() => {
          void handleSpeakPress();
        }}
        onRepeatPress={announceStatus}
        onOpenDevView={() => setScreen("tools")}
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

        <Text style={styles.sectionTitle}>Emergency</Text>
        <ActionButton
          label="Emergency SOS (demo)"
          hint="Starts a ten second countdown, then asks you to confirm. No real call is placed."
          onPress={() => sos.trigger("manual")}
          disabled={sos.state.phase !== "idle"}
        />

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
      <SosModal
        state={sos.state}
        onConfirm={sos.confirm}
        onCancel={sos.cancel}
        onDismiss={sos.dismiss}
      />
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
