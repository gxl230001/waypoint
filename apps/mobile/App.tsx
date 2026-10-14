import React, { useCallback, useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { ActionButton } from "./src/components/ActionButton";
import {
  ImuCollectionPanel,
  type ImuSummary,
} from "./src/imu/ImuCollectionPanel";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function App() {
  const [apiStatus, setApiStatus] = useState("Not checked");
  const [navigationActive, setNavigationActive] = useState(false);
  const [imu, setImu] = useState<ImuSummary>({
    recording: false,
    activityLabel: null,
    totalSamples: 0,
  });
  const [message, setMessage] = useState(
    "Welcome. Your navigation prototype is ready."
  );

  // Sensor subscriptions are owned by the IMU panel's recorder hook, which
  // removes them on stop, on backgrounding, and on unmount.
  useEffect(() => {
    return () => {
      Speech.stop();
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
    setMessage("Demo navigation started. Real route guidance is not implemented.");

    Speech.speak(
      "Demo navigation started. Real route guidance is not implemented."
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function stopNavigation() {
    setNavigationActive(false);
    setMessage("Navigation stopped.");

    Speech.stop();
    Speech.speak("Navigation stopped.");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  async function testHaptics() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessage("Haptic feedback test completed.");
  }

  function announceStatus() {
    Speech.speak(message);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
        </View>

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
});
