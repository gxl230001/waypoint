import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type HomeScreenProps = {
  /** The latest instruction or status. Shown large in the top half. */
  message: string;
  listening: boolean;
  onSpeakPress: () => void;
  onRepeatPress: () => void;
  onOpenTools: () => void;
};

/**
 * Split screen, built for one hand and no looking:
 *   top half    the latest message in large text. Tap it to hear it again.
 *   bottom half one big "Tap to speak" button.
 * A single small link at the very bottom opens settings and developer tools.
 */
export function HomeScreen({
  message,
  listening,
  onSpeakPress,
  onRepeatPress,
  onOpenTools,
}: HomeScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableOpacity
        style={styles.topHalf}
        onPress={onRepeatPress}
        accessibilityRole="button"
        accessibilityLabel={`Latest message: ${message}`}
        accessibilityHint="Double tap to hear it again."
        accessibilityLiveRegion="polite"
        activeOpacity={0.85}
      >
        <Text style={styles.eyebrow}>WAYPOINT</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.tapToRepeat}>Tap here to repeat</Text>
      </TouchableOpacity>

      <View style={styles.bottomHalf}>
        <TouchableOpacity
          style={[styles.speakButton, listening && styles.speakButtonActive]}
          onPress={onSpeakPress}
          accessibilityRole="button"
          accessibilityLabel={listening ? "Listening" : "Tap to speak"}
          accessibilityHint="Then say a command, such as start navigation, stop, repeat, or help me."
          accessibilityState={{ busy: listening }}
          activeOpacity={0.8}
        >
          <Text style={styles.speakButtonText}>
            {listening ? "Listening..." : "Tap to speak"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolsLink}
          onPress={onOpenTools}
          accessibilityRole="button"
          accessibilityLabel="Settings and tools"
        >
          <Text style={styles.toolsLinkText}>Settings and tools</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F7F9",
  },
  topHalf: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#475569",
    marginBottom: 12,
  },
  message: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "700",
    color: "#14213D",
  },
  tapToRepeat: {
    fontSize: 15,
    color: "#475569",
    marginTop: 16,
  },
  bottomHalf: {
    flex: 1,
    padding: 16,
  },
  speakButton: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "#14213D",
    alignItems: "center",
    justifyContent: "center",
  },
  speakButtonActive: {
    backgroundColor: "#1D4ED8",
  },
  speakButtonText: {
    fontSize: 36,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  toolsLink: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  toolsLinkText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
    textDecorationLine: "underline",
  },
});
