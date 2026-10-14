import React, { useEffect, useRef, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import {
  Accelerometer,
  Gyroscope,
  type AccelerometerMeasurement,
  type GyroscopeMeasurement,
} from "expo-sensors";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type SensorSample = {
  timestamp: number;
  sensor: "accelerometer" | "gyroscope";
  x: number;
  y: number;
  z: number;
};

export default function App() {
  const [apiStatus, setApiStatus] = useState("Not checked");
  const [navigationActive, setNavigationActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [message, setMessage] = useState(
    "Welcome. Your navigation prototype is ready."
  );

  const samples = useRef<SensorSample[]>([]);
  const lastUIUpdate = useRef(0);

  const accelerometerSubscription = useRef<ReturnType<
    typeof Accelerometer.addListener
  > | null>(null);

  const gyroscopeSubscription = useRef<ReturnType<
    typeof Gyroscope.addListener
  > | null>(null);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    Gyroscope.setUpdateInterval(100);

    return () => {
      accelerometerSubscription.current?.remove();
      gyroscopeSubscription.current?.remove();
      Speech.stop();
    };
  }, []);

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

  function startRecording() {
    if (recording) return;

    samples.current = [];
    setSampleCount(0);

    const addSample = (
      sensor: SensorSample["sensor"],
      reading: AccelerometerMeasurement | GyroscopeMeasurement
    ) => {
      samples.current.push({
        timestamp: Date.now(),
        sensor,
        x: reading.x,
        y: reading.y,
        z: reading.z,
      });

      // Avoid rerendering the entire screen for every sensor reading.
      const now = Date.now();
      if (now - lastUIUpdate.current >= 500) {
        lastUIUpdate.current = now;
        setSampleCount(samples.current.length);
      }
    };

    accelerometerSubscription.current = Accelerometer.addListener(
      (reading) => addSample("accelerometer", reading)
    );

    gyroscopeSubscription.current = Gyroscope.addListener(
      (reading) => addSample("gyroscope", reading)
    );

    setRecording(true);
    setMessage("Recording sensor samples in memory.");
    Speech.speak("Sensor recording started.");
  }

  function stopRecording() {
    accelerometerSubscription.current?.remove();
    gyroscopeSubscription.current?.remove();

    accelerometerSubscription.current = null;
    gyroscopeSubscription.current = null;

    setRecording(false);
    setSampleCount(samples.current.length);
    setMessage(
      `Recording stopped. ${samples.current.length} sensor samples collected.`
    );

    Speech.speak("Sensor recording stopped.");
    console.log("Sensor recording:", samples.current);
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
            IMU recording: {recording ? "Recording" : "Idle"}
          </Text>
          <Text style={styles.statusText}>
            Samples collected: {sampleCount}
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
        <ActionButton
          label="Start Sensor Recording"
          hint="Records accelerometer and gyroscope samples in temporary memory."
          onPress={startRecording}
          disabled={recording}
        />
        <ActionButton
          label="Stop Sensor Recording"
          onPress={stopRecording}
          disabled={!recording}
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
          available yet. Sensor samples are currently held in memory and
          are not exported or uploaded.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  hint?: string;
};

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  hint,
}: ActionButtonProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.button,
        primary && styles.primaryButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          primary && styles.primaryButtonText,
          disabled && styles.disabledButtonText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  button: {
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#14213D",
    borderColor: "#14213D",
  },
  buttonText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
  },
  primaryButtonText: {
    color: "#FFFFFF",
  },
  disabledButton: {
    backgroundColor: "#E2E8F0",
    borderColor: "#CBD5E1",
  },
  disabledButtonText: {
    color: "#64748B",
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
