import React, { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ActionButton } from "../components/ActionButton";
import {
  isValidPhone,
  nextTextScale,
  nextVerbosity,
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  stepSpeechRate,
} from "./settingsModel";
import { useSettings } from "./useSettings";

const VERBOSITY_TEXT = {
  minimal: "Minimal",
  normal: "Normal",
  detailed: "Detailed",
} as const;

export function SettingsPanel() {
  const { settings, update } = useSettings();
  const [name, setName] = useState(settings.emergencyContact?.name ?? "");
  const [phone, setPhone] = useState(settings.emergencyContact?.phone ?? "");
  const [contactError, setContactError] = useState<string | null>(null);

  function saveContact() {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setContactError("Enter a name for your emergency contact.");
      return;
    }
    if (!isValidPhone(phone)) {
      setContactError("Enter a valid phone number, for example +1 555 123 4567.");
      return;
    }
    update({ emergencyContact: { name: trimmedName, phone: phone.trim() } });
    setContactError(null);
  }

  function clearContact() {
    update({ emergencyContact: null });
    setName("");
    setPhone("");
    setContactError(null);
  }

  const rate = settings.speechRate;

  return (
    <View>
      <Text style={styles.groupTitle}>Speech</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Speech rate: {rate.toFixed(2)}x</Text>
        <View style={styles.stepper}>
          <View style={styles.stepperButton}>
            <ActionButton
              label="Slower"
              hint={`Lowers the speech rate. Currently ${rate.toFixed(2)} times.`}
              onPress={() => update({ speechRate: stepSpeechRate(rate, -1) })}
              disabled={rate <= SPEECH_RATE_MIN}
            />
          </View>
          <View style={styles.stepperButton}>
            <ActionButton
              label="Faster"
              hint={`Raises the speech rate. Currently ${rate.toFixed(2)} times.`}
              onPress={() => update({ speechRate: stepSpeechRate(rate, 1) })}
              disabled={rate >= SPEECH_RATE_MAX}
            />
          </View>
        </View>
      </View>

      <ActionButton
        label={`Detail level: ${VERBOSITY_TEXT[settings.verbosity]}`}
        hint="Cycles between minimal, normal and detailed spoken messages."
        onPress={() => update({ verbosity: nextVerbosity(settings.verbosity) })}
      />

      <Text style={styles.groupTitle}>Touch and display</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel} accessibilityElementsHidden>
          Haptic feedback
        </Text>
        <Switch
          accessibilityLabel="Haptic feedback"
          value={settings.hapticsEnabled}
          onValueChange={(value) => update({ hapticsEnabled: value })}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel} accessibilityElementsHidden>
          High contrast
        </Text>
        <Switch
          accessibilityLabel="High contrast"
          value={settings.highContrast}
          onValueChange={(value) => update({ highContrast: value })}
        />
      </View>
      <ActionButton
        label={`Text size: ${Math.round(settings.textScale * 100)} percent`}
        hint="Cycles between normal, large and extra large text."
        onPress={() => update({ textScale: nextTextScale(settings.textScale) })}
      />

      <Text style={styles.groupTitle}>Emergency contact</Text>
      <Text style={styles.help}>
        Used by the SOS feature. If none is set, SOS uses the default emergency
        number (demo only, no real call is placed).
      </Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Contact name"
        accessibilityLabel="Emergency contact name"
        autoCapitalize="words"
        maxLength={60}
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone number"
        accessibilityLabel="Emergency contact phone number"
        keyboardType="phone-pad"
        maxLength={20}
      />
      {contactError && (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {contactError}
        </Text>
      )}
      <ActionButton label="Save emergency contact" onPress={saveContact} primary />
      <ActionButton
        label="Remove emergency contact"
        onPress={clearContact}
        disabled={settings.emergencyContact === null && name === "" && phone === ""}
      />
      <Text style={styles.help}>
        {settings.emergencyContact
          ? `Saved: ${settings.emergencyContact.name}, ${settings.emergencyContact.phone}`
          : "No emergency contact saved."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#14213D",
    marginTop: 12,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 44,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 16,
    color: "#334155",
    marginRight: 12,
  },
  stepper: {
    flexDirection: "row",
  },
  stepperButton: {
    marginLeft: 8,
    minWidth: 96,
  },
  help: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    marginBottom: 10,
  },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#14213D",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  error: {
    fontSize: 15,
    color: "#B91C1C",
    marginBottom: 10,
  },
});
