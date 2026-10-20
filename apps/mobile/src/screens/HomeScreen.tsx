import React from "react";
import {
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ViewToggle } from "../components/ViewToggle";

export type UserViewMode = "idle" | "navigating" | "sos";

type HomeScreenProps = {
  mode: UserViewMode;
  destination: string;
  instruction: string;
  listening: boolean;
  onSpeakPress: () => void;
  onRepeatPress: () => void;
  onOpenDevView: () => void;
};

const BLUE = "#19489B";
const RED = "#B80D18";
const SOS_BADGE = "#F22B1D";
const BLUE_CARD = "#DCE7F8";
const RED_CARD = "#F3D5D8";

/**
 * User-facing screens from the Figma prototype:
 * idle chat, turn-by-turn guidance, and SOS after a sensed fall or trip.
 */
export function HomeScreen({
  mode,
  destination,
  instruction,
  listening,
  onSpeakPress,
  onRepeatPress,
  onOpenDevView,
}: HomeScreenProps) {
  const sos = mode === "sos";
  const backgroundColor = sos ? RED : BLUE;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <StatusBar style="light" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={styles.logo}
            importantForAccessibility="no"
          >
            waypoint
          </Text>
          <View style={styles.devToggle}>
            <ViewToggle
              label="Dev"
              hint="Switches to the developer view with settings, sensors and test tools."
              onPress={onOpenDevView}
              onDark
              compact
            />
          </View>
        </View>

        {mode === "idle" ? (
          <IdleChat listening={listening} onSpeakPress={onSpeakPress} />
        ) : null}

        {mode === "navigating" ? (
          <NavigationView
            destination={destination}
            instruction={instruction}
            onRepeatPress={onRepeatPress}
          />
        ) : null}

        {mode === "sos" ? (
          <SosView
            listening={listening}
            onSpeakPress={onSpeakPress}
            onRepeatPress={onRepeatPress}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function IdleChat({
  listening,
  onSpeakPress,
}: {
  listening: boolean;
  onSpeakPress: () => void;
}) {
  return (
    <View style={styles.idleBody}>
      <TouchableOpacity
        style={styles.micHitArea}
        onPress={onSpeakPress}
        accessibilityRole="button"
        accessibilityLabel={listening ? "Listening" : "Tap to chat"}
        accessibilityHint="Then say a command, such as start navigation, stop, repeat, or help me."
        accessibilityState={{ busy: listening }}
        activeOpacity={0.85}
      >
        <Text style={styles.chatPrompt}>
          {listening ? "LISTENING…" : "TAP TO CHAT"}
        </Text>
        <View
          style={[styles.micCircle, listening && styles.micCircleListening]}
        >
          <MicIcon />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function NavigationView({
  destination,
  instruction,
  onRepeatPress,
}: {
  destination: string;
  instruction: string;
  onRepeatPress: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Headed to ${destination}`}
        style={[styles.messageCard, styles.navigationCard]}
      >
        <Text style={styles.destinationLabel}>HEADED TO</Text>
        <Text style={styles.destinationText}>{destination}</Text>
      </View>

      <View
        style={styles.glyphArea}
        accessible
        accessibilityLabel="Turn left"
      >
        <TurnGlyph />
      </View>

      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={instruction.replace(/\n/g, ". ")}
        style={[styles.messageCard, styles.navigationCard]}
      >
        <Text style={styles.instructionText}>{instruction}</Text>
      </View>

      <SpeakerControl
        label="Repeat"
        hint="Double tap to hear the last instruction again."
        onPress={onRepeatPress}
      />
    </View>
  );
}

function SosView({
  listening,
  onSpeakPress,
  onRepeatPress,
}: {
  listening: boolean;
  onSpeakPress: () => void;
  onRepeatPress: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.glyphArea}>
        <TouchableOpacity
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel="SOS. Fall or trip detected. Double tap to hear the alert again."
          onPress={onRepeatPress}
          activeOpacity={0.9}
          style={styles.sosBadge}
        >
          <Text style={styles.sosBadgeText}>SOS</Text>
        </TouchableOpacity>
      </View>

      <View
        accessible
        accessibilityRole="text"
        style={[styles.messageCard, styles.sosMessageCard]}
      >
        <Text style={styles.instructionText}>
          {listening ? "Listening…" : "SOS\nPlease respond"}
        </Text>
      </View>

      <SpeakerControl
        label="Speak"
        hint="Double tap to speak a response, such as I am okay."
        onPress={onSpeakPress}
        busy={listening}
      />
    </View>
  );
}

function SpeakerControl({
  label,
  hint,
  onPress,
  busy = false,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.speakerWrap}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={busy ? "Listening" : label}
      accessibilityHint={hint}
      accessibilityState={{ busy }}
      activeOpacity={0.75}
    >
      <SpeakerIcon />
      <Text style={styles.speakerLabel}>{busy ? "Listening…" : label}</Text>
    </TouchableOpacity>
  );
}

function MicIcon() {
  return <MaterialCommunityIcons name="microphone" size={92} color={BLUE} />;
}

function SpeakerIcon() {
  return (
    <MaterialCommunityIcons name="volume-high" size={76} color="#FFFFFF" />
  );
}

function TurnGlyph() {
  return (
    <View style={styles.turnGlyph}>
      <MaterialCommunityIcons
        name="arrow-left-top-bold"
        size={176}
        color="#FFFFFF"
      />
      <View style={styles.turnDot} />
    </View>
  );
}

const readableFont = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui",
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  header: {
    height: 88,
    justifyContent: "center",
    alignItems: "center",
  },
  devToggle: {
    position: "absolute",
    right: 4,
    top: 0,
  },
  logo: {
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 46,
    lineHeight: 56,
    fontFamily: readableFont,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  idleBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 68,
  },
  micHitArea: {
    width: 300,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  chatPrompt: {
    color: "#FFFFFF",
    fontFamily: readableFont,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 24,
    textAlign: "center",
  },
  micCircle: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#071D46",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  micCircleListening: {
    backgroundColor: "#EAF1FC",
  },
  stack: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 18,
    alignItems: "center",
  },
  messageCard: {
    marginTop: 20,
    width: "100%",
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  navigationCard: {
    backgroundColor: BLUE_CARD,
  },
  sosMessageCard: {
    backgroundColor: RED_CARD,
  },
  destinationLabel: {
    color: BLUE,
    fontFamily: readableFont,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  destinationText: {
    color: BLUE,
    fontFamily: readableFont,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  instructionText: {
    color: "#15264A",
    fontFamily: readableFont,
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 32,
  },
  glyphArea: {
    height: 235,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  sosBadge: {
    width: "100%",
    maxWidth: 360,
    height: 190,
    backgroundColor: SOS_BADGE,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#650008",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  sosBadgeText: {
    color: "#FFFFFF",
    fontFamily: readableFont,
    fontSize: 96,
    lineHeight: 112,
    fontWeight: "900",
    letterSpacing: 2,
  },
  speakerWrap: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 6,
    minHeight: 108,
    justifyContent: "center",
  },
  speakerLabel: {
    marginTop: 10,
    color: "#FFFFFF",
    fontFamily: readableFont,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  turnGlyph: {
    width: 230,
    height: 190,
    alignItems: "center",
    justifyContent: "center",
  },
  turnDot: {
    position: "absolute",
    right: 6,
    top: 74,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
  },
});
