import React from "react";
import { Modal, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "../components/ActionButton";
import { describeDemoCall, targetLabel, type SosState } from "./sosMachine";

type SosModalProps = {
  state: SosState;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
};

/**
 * Full-screen popup for the SOS flow. Each phase has one obvious primary
 * action. The big number is hidden from the screen reader because the same
 * countdown is already spoken aloud, and reading it twice would be noise.
 */
export function SosModal({ state, onConfirm, onCancel, onDismiss }: SosModalProps) {
  const visible = state.phase !== "idle";

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={state.phase === "called" ? onDismiss : onCancel}
    >
      <SafeAreaView
        style={[styles.safeArea, state.phase === "called" && styles.safeAreaCalled]}
        accessibilityViewIsModal
      >
        {state.phase === "countdown" && (
          <View style={styles.body}>
            <Text style={styles.title} accessibilityRole="header">
              Emergency help requested
            </Text>
            <Text style={styles.subtitle}>
              Calling {targetLabel(state.target)} in
            </Text>
            <Text style={styles.counter} accessibilityElementsHidden>
              {state.secondsLeft}
            </Text>
            <ActionButton label="Cancel. I am okay" onPress={onCancel} primary />
          </View>
        )}

        {state.phase === "confirm" && (
          <View style={styles.body}>
            <Text style={styles.title} accessibilityRole="header">
              Do you need help?
            </Text>
            <Text style={styles.subtitle}>
              Call {targetLabel(state.target)}? Calling automatically in
            </Text>
            <Text style={styles.counter} accessibilityElementsHidden>
              {state.secondsLeft}
            </Text>
            <ActionButton label="Yes, call now" onPress={onConfirm} primary />
            <ActionButton label="No, cancel" onPress={onCancel} />
          </View>
        )}

        {state.phase === "called" && (
          <View style={styles.body}>
            <Text style={styles.demoBadge}>DEMO ONLY</Text>
            <Text style={styles.title} accessibilityRole="header">
              {state.autoProceeded ? "No answer. Help would be called" : "Help would be called"}
            </Text>
            <Text style={styles.subtitle}>{describeDemoCall(state.target)}</Text>
            <ActionButton label="Done" onPress={onDismiss} primary />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#7F1D1D",
  },
  safeAreaCalled: {
    backgroundColor: "#14213D",
  },
  body: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 20,
    lineHeight: 28,
    color: "#FEE2E2",
    marginBottom: 12,
  },
  counter: {
    fontSize: 120,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    marginVertical: 16,
  },
  demoBadge: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#14213D",
    backgroundColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
    overflow: "hidden",
  },
});
