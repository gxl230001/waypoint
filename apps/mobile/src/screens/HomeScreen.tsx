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
import { describeDemoCall, targetLabel, type SosState } from "../sos/sosMachine";

export type UserViewMode = "idle" | "navigating" | "sos";

type HomeScreenProps = {
  mode: UserViewMode;
  destination: string;
  instruction: string;
  listening: boolean;
  onSpeakPress: () => void;
  onRepeatPress: () => void;
  onOpenDevView: () => void;
  /** Where the SOS flow is. Only read when mode is "sos". */
  sos: SosState;
  onSosOkay: () => void;
  onSosConfirm: () => void;
  onSosDismiss: () => void;
};

const BLUE = "#1B4FE0";
const RED = "#C4161C";
const SOS_BADGE = "#E31B23";
const PILL_FILL = "rgba(255, 255, 255, 0.28)";

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
  sos: sosState,
  onSosOkay,
  onSosConfirm,
  onSosDismiss,
}: HomeScreenProps) {
  const sos = mode === "sos";
  const backgroundColor = sos ? RED : BLUE;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      <StatusBar style="light" />
      {/* No way out of the SOS screen except answering it. */}
      {!sos && (
        <ViewToggle
          label="Dev view"
          hint="Switches to the developer view with settings, sensors and test tools."
          onPress={onOpenDevView}
          onDark
        />
      )}

      <Text
        accessibilityRole="header"
        style={styles.logo}
        importantForAccessibility="no"
      >
        waypoint
      </Text>

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
          state={sosState}
          listening={listening}
          onRepeatPress={onRepeatPress}
          onOkay={onSosOkay}
          onConfirm={onSosConfirm}
          onDismiss={onSosDismiss}
        />
      ) : null}
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
        accessibilityHint="Starts navigation and reads out the directions."
        accessibilityState={{ busy: listening }}
        activeOpacity={0.85}
      >
        <ArcLabel text={listening ? "listening..." : "tap to chat"} />
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
        style={styles.pill}
      >
        <Text style={styles.pillText}>Headed to: {destination}</Text>
      </View>

      <View
        style={styles.glyphArea}
        accessible
        accessibilityLabel="Turn right"
      >
        <TurnGlyph />
      </View>

      <View
        accessible
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        accessibilityLabel={instruction.replace(/\n/g, ". ")}
        style={styles.pill}
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
  state,
  listening,
  onRepeatPress,
  onOkay,
  onConfirm,
  onDismiss,
}: {
  state: SosState;
  listening: boolean;
  onRepeatPress: () => void;
  onOkay: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const counting = state.phase === "countdown" || state.phase === "confirm";
  const headline =
    state.phase === "countdown"
      ? `Calling ${targetLabel(state.target)} in ${state.secondsLeft}`
      : state.phase === "confirm"
        ? `Do you need help?\nCalling in ${state.secondsLeft}`
        : state.phase === "called"
          ? describeDemoCall(state.target)
          : "SOS\nPlease Respond";

  return (
    <View style={styles.stack}>
      <View style={styles.glyphArea}>
        <TouchableOpacity
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel="SOS. Double tap to hear the alert again."
          onPress={onRepeatPress}
          activeOpacity={0.9}
          style={styles.sosBadge}
        >
          <Text style={styles.sosBadgeText}>SOS</Text>
        </TouchableOpacity>
      </View>

      <View accessible accessibilityRole="text" style={styles.pill}>
        {state.phase === "called" ? (
          <Text style={styles.demoBadge}>DEMO ONLY</Text>
        ) : null}
        <Text style={styles.instructionText}>{headline}</Text>
      </View>

      {state.phase === "confirm" ? (
        <SosButton
          label="Yes, call now"
          hint="Calls for help right away. Demo only, no real call is placed."
          onPress={onConfirm}
        />
      ) : null}
      {counting ? (
        <SosButton
          label="I'm OK"
          hint="Cancels the emergency call. You can also say I am okay."
          onPress={onOkay}
          primary
        />
      ) : null}
      {state.phase === "called" ? (
        <SosButton label="Done" hint="Returns to the main screen." onPress={onDismiss} primary />
      ) : null}

      <Text style={styles.sosListening} accessibilityElementsHidden>
        {listening ? "Listening: say I'm okay" : ""}
      </Text>
    </View>
  );
}

function SosButton({
  label,
  hint,
  onPress,
  primary = false,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.sosButton, primary && styles.sosButtonPrimary]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      activeOpacity={0.8}
    >
      <Text style={[styles.sosButtonText, primary && styles.sosButtonTextPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
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
      <Text style={styles.speakerLabel}>{busy ? "Listening..." : label}</Text>
    </TouchableOpacity>
  );
}

function ArcLabel({ text }: { text: string }) {
  const letters = Array.from(text);
  const start = -62;
  const end = 62;
  const step = letters.length > 1 ? (end - start) / (letters.length - 1) : 0;
  const radius = 132;

  return (
    <View pointerEvents="none" style={styles.arcWrap}>
      {letters.map((letter, index) => {
        const angle = start + index * step;
        const rad = (angle * Math.PI) / 180;
        return (
          <Text
            key={`${letter}-${index}`}
            style={[
              styles.arcLetter,
              {
                transform: [
                  { translateX: Math.sin(rad) * radius },
                  { translateY: -Math.cos(rad) * radius },
                  { rotate: `${angle}deg` },
                ],
              },
            ]}
          >
            {letter}
          </Text>
        );
      })}
    </View>
  );
}

function MicIcon() {
  return (
    <View style={styles.micIcon}>
      <View style={styles.micCapsule} />
      <View style={styles.micYoke} />
      <View style={styles.micStem} />
      <View style={styles.micBase} />
    </View>
  );
}

function SpeakerIcon() {
  return (
    <View style={styles.speakerIcon}>
      <View style={styles.speakerBody} />
      <View style={styles.speakerHorn} />
      <View style={[styles.speakerWave, styles.speakerWaveInner]} />
      <View style={[styles.speakerWave, styles.speakerWaveOuter]} />
    </View>
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

const logoFont = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  logo: {
    marginTop: 8,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 42,
    fontFamily: logoFont,
    fontStyle: "italic",
    fontWeight: "700",
  },
  idleBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  micHitArea: {
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  micCircle: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  micCircleListening: {
    backgroundColor: "#E8F0FF",
  },
  arcWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  arcLetter: {
    position: "absolute",
    width: 18,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: logoFont,
    fontStyle: "italic",
    fontWeight: "600",
  },
  stack: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 24,
    alignItems: "center",
  },
  pill: {
    marginTop: 20,
    width: "100%",
    backgroundColor: PILL_FILL,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  pillText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  instructionText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 30,
  },
  glyphArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  sosBadge: {
    width: "100%",
    height: 176,
    backgroundColor: SOS_BADGE,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sosBadgeText: {
    color: "#FFFFFF",
    fontSize: 92,
    fontWeight: "800",
    letterSpacing: 2,
  },
  demoBadge: {
    alignSelf: "center",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#14213D",
    backgroundColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  sosButton: {
    marginTop: 14,
    width: "100%",
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sosButtonPrimary: {
    backgroundColor: "#FFFFFF",
  },
  sosButtonText: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  sosButtonTextPrimary: {
    color: RED,
  },
  sosListening: {
    marginTop: 12,
    color: "#FEE2E2",
    fontSize: 16,
    minHeight: 22,
  },
  speakerWrap: {
    marginTop: "auto",
    alignItems: "center",
    paddingVertical: 12,
    minHeight: 120,
    justifyContent: "flex-end",
  },
  speakerLabel: {
    marginTop: 10,
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  micIcon: {
    width: 64,
    height: 92,
    alignItems: "center",
  },
  micCapsule: {
    width: 34,
    height: 52,
    borderRadius: 17,
    backgroundColor: BLUE,
  },
  micYoke: {
    position: "absolute",
    top: 18,
    width: 54,
    height: 42,
    borderBottomLeftRadius: 27,
    borderBottomRightRadius: 27,
    borderWidth: 6,
    borderTopWidth: 0,
    borderColor: BLUE,
  },
  micStem: {
    marginTop: 14,
    width: 6,
    height: 16,
    backgroundColor: BLUE,
    borderRadius: 3,
  },
  micBase: {
    width: 28,
    height: 6,
    backgroundColor: BLUE,
    borderRadius: 3,
  },
  speakerIcon: {
    width: 92,
    height: 72,
    justifyContent: "center",
  },
  speakerBody: {
    position: "absolute",
    left: 0,
    top: 22,
    width: 18,
    height: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
  },
  speakerHorn: {
    position: "absolute",
    left: 14,
    top: 8,
    width: 0,
    height: 0,
    borderTopWidth: 28,
    borderBottomWidth: 28,
    borderLeftWidth: 28,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
  },
  speakerWave: {
    position: "absolute",
    borderColor: "#FFFFFF",
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 0,
    borderRadius: 40,
  },
  speakerWaveInner: {
    left: 44,
    top: 18,
    width: 22,
    height: 36,
  },
  speakerWaveOuter: {
    left: 56,
    top: 8,
    width: 32,
    height: 56,
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
