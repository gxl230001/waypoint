import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type ViewToggleProps = {
  label: string;
  hint: string;
  onPress: () => void;
};

/** Small pill in the top right corner that switches between user and dev view. */
export function ViewToggle({ label, hint, onPress }: ViewToggleProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
        activeOpacity={0.75}
        style={styles.pill}
      >
        <Text style={styles.text}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pill: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14213D",
  },
});
