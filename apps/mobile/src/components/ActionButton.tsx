import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  hint?: string;
};

export function ActionButton({
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
});
