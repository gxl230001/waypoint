import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function TrialCounters() {
  const [realFalls, setRealFalls] = useState(0);
  const [missed, setMissed] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trial Scorecard</Text>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Real falls: ${realFalls}. Tap to increment.`}
          style={[styles.counterButton, styles.realFallButton]}
          onPress={() => setRealFalls((c) => c + 1)}
        >
          <Text style={styles.counterValue}>{realFalls}</Text>
          <Text style={styles.counterLabel}>Real fall</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Missed falls: ${missed}. Tap to increment.`}
          style={[styles.counterButton, styles.missedButton]}
          onPress={() => setMissed((c) => c + 1)}
        >
          <Text style={styles.counterValue}>{missed}</Text>
          <Text style={styles.counterLabel}>Missed</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`False alarms: ${falseAlarms}. Tap to increment.`}
          style={[styles.counterButton, styles.falseAlarmButton]}
          onPress={() => setFalseAlarms((c) => c + 1)}
        >
          <Text style={styles.counterValue}>{falseAlarms}</Text>
          <Text style={styles.counterLabel}>False alarm</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    marginBottom: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  counterButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minHeight: 64,
  },
  realFallButton: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  missedButton: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  falseAlarmButton: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  counterValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#14213D",
  },
  counterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginTop: 2,
    textAlign: "center",
  },
});
