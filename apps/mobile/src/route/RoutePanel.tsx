import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActionButton } from "../components/ActionButton";
import { listRoutes, loadRoute, saveRoute } from "./storage";
import { useRouteRecorder } from "./useRouteRecorder";
import type { Route } from "./types";

export interface RoutePanelProps {
  onMessage?: (text: string) => void;
}

function getCardinalDirection(headingDeg: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(headingDeg / 45) % 8;
  return directions[index];
}

export function RoutePanel({ onMessage }: RoutePanelProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [routeNameInput, setRouteNameInput] = useState<string>("Hallway Route");
  const [landmarkInput, setLandmarkInput] = useState<string>("");
  const [showLandmarkField, setShowLandmarkField] = useState<boolean>(false);

  const refreshList = () => {
    const { items } = listRoutes();
    setRoutes(items);
  };

  useEffect(() => {
    refreshList();
  }, []);

  const recorder = useRouteRecorder((savedRoute) => {
    refreshList();
    setSelectedRoute(savedRoute);
    const msg = `Route "${savedRoute.name}" saved with ${savedRoute.totalSteps} steps in ${savedRoute.legs.length} legs.`;
    setStatusMessage(msg);
    onMessage?.(msg);
  });

  const handleStartRecording = async () => {
    const name = routeNameInput.trim() || `Route ${routes.length + 1}`;
    const result = await recorder.startRecording(name);
    if (!result.ok && result.error) {
      setStatusMessage(result.error);
      onMessage?.(result.error);
    } else {
      setStatusMessage(`Recording started for "${name}". Walk holding phone upright.`);
      onMessage?.(`Recording route "${name}".`);
    }
  };

  const handleMarkTurn = () => {
    recorder.markTurn();
    setStatusMessage("Manual turn marked.");
  };

  const handleMarkLandmark = () => {
    if (!showLandmarkField) {
      setShowLandmarkField(true);
      return;
    }
    const clean = landmarkInput.trim();
    if (clean) {
      recorder.markLandmark(clean);
      setStatusMessage(`Marked landmark: "${clean}"`);
      setLandmarkInput("");
      setShowLandmarkField(false);
    }
  };

  const handleMarkEnd = async () => {
    const res = await recorder.markEnd();
    if (res?.ok) {
      refreshList();
    }
  };

  const handleSaveFakeRoute = () => {
    const timestamp = new Date().toISOString();
    const fakeId = `route_${Date.now()}`;
    const fakeRoute: Route = {
      id: fakeId,
      name: `Demo Hallway (${routes.length + 1})`,
      createdAt: timestamp,
      version: 1,
      totalSteps: 40,
      legs: [
        {
          steps: 25,
          headingDeg: 0,
          turnAfterDeg: 90,
          label: "Water fountain",
        },
        {
          steps: 15,
          headingDeg: 90,
          turnAfterDeg: null,
          label: "Room 101",
        },
      ],
      notes: "Hardcoded fake route for storage testing.",
    };

    const result = saveRoute(fakeRoute);
    if (result.ok) {
      const msg = `Saved demo route "${result.route.name}".`;
      setStatusMessage(msg);
      onMessage?.(msg);
      refreshList();
      setSelectedRoute(result.route);
    } else {
      const msg = `Failed to save route: ${result.error}`;
      setStatusMessage(msg);
      onMessage?.(msg);
    }
  };

  const handleLoadRoute = (id: string) => {
    const loaded = loadRoute(id);
    if (loaded) {
      setSelectedRoute(loaded);
      const msg = `Loaded route: "${loaded.name}".`;
      setStatusMessage(msg);
      onMessage?.(msg);
    } else {
      const msg = `Failed to load route ${id}.`;
      setStatusMessage(msg);
      onMessage?.(msg);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.disclaimer}>
        Demo of route replay, not live obstacle detection or safety-validated navigation.
        Phone orientation is assumed identical during recording and navigation (held upright in front of the body).
      </Text>

      {/* Permission or Sensor Warnings */}
      {recorder.permissionError && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningTitle}>SENSOR PERMISSION NEEDED</Text>
          <Text style={styles.warningText}>{recorder.permissionError}</Text>
        </View>
      )}

      {/* Compass Calibration Warning */}
      {recorder.calibrationMessage && (
        <View style={styles.calibrationBanner}>
          <Text style={styles.calibrationTitle}>COMPASS CALIBRATION REQUIRED</Text>
          <Text style={styles.calibrationText}>{recorder.calibrationMessage}</Text>
        </View>
      )}

      {/* Live Heading & Steps Status Readout */}
      <View style={styles.sensorStatusCard}>
        <Text style={styles.sensorCardTitle}>Live Sensors</Text>
        <Text style={styles.sensorStatusText}>
          Heading: {recorder.live.headingDeg}° ({getCardinalDirection(recorder.live.headingDeg)})
          {"  "}| Compass: {recorder.isCalibrated ? "Calibrated" : "Uncalibrated"}
        </Text>
        {recorder.isRecording && (
          <Text style={styles.liveStepsHighlight}>
            Steps Walked: {recorder.live.steps}
          </Text>
        )}
      </View>

      {/* Recording Controls */}
      <View style={styles.recorderCard}>
        <Text style={styles.cardHeading}>Route Teaching (Recorder)</Text>

        {!recorder.isRecording ? (
          <>
            <Text style={styles.inputLabel}>Route Name:</Text>
            <TextInput
              style={styles.textInput}
              value={routeNameInput}
              onChangeText={setRouteNameInput}
              placeholder="e.g. Hallway to Room 101"
              accessibilityLabel="Route Name Input"
            />

            <ActionButton
              label="Start Recording"
              hint="Begins recording steps and heading. Walk holding the phone upright in front of you."
              onPress={handleStartRecording}
              primary
              disabled={!recorder.isCalibrated || !!recorder.permissionError}
            />

            <ActionButton
              label="Save Fake Route (Demo)"
              hint="Saves a hardcoded demo route to verify storage."
              onPress={handleSaveFakeRoute}
            />
          </>
        ) : (
          <View style={styles.activeRecordingArea}>
            <View style={styles.recordingBanner}>
              <Text style={styles.recordingBannerText}>
                ● RECORDING: {routeNameInput}
              </Text>
            </View>

            <ActionButton
              label="Mark Turn"
              hint="Manually segments the current leg and starts a new leg with current heading."
              onPress={handleMarkTurn}
            />

            {showLandmarkField && (
              <View style={styles.landmarkFieldContainer}>
                <Text style={styles.inputLabel}>Landmark Name (e.g. elevator):</Text>
                <TextInput
                  style={styles.textInput}
                  value={landmarkInput}
                  onChangeText={setLandmarkInput}
                  placeholder="e.g. Water fountain"
                  accessibilityLabel="Landmark Name Input"
                  autoFocus
                />
              </View>
            )}

            <ActionButton
              label={showLandmarkField ? "Confirm Landmark" : "Mark Landmark"}
              hint="Attaches a spoken landmark cue to this leg."
              onPress={handleMarkLandmark}
            />

            <ActionButton
              label="Mark End (Save Route)"
              hint="Finalizes route, merges short legs, and saves to phone storage."
              onPress={handleMarkEnd}
              primary
            />

            <ActionButton
              label="Cancel Recording"
              hint="Discards the in-progress recording session."
              onPress={recorder.cancelRecording}
            />
          </View>
        )}
      </View>

      {statusMessage ? (
        <Text style={styles.statusMessage}>{statusMessage}</Text>
      ) : null}

      {/* Saved Routes List */}
      <Text style={styles.subheading}>
        Saved routes ({routes.length})
      </Text>

      {routes.length === 0 ? (
        <Text style={styles.emptyText}>No saved routes found on device.</Text>
      ) : (
        routes.map((r) => (
          <View key={r.id} style={styles.routeCard}>
            <Text style={styles.routeName}>{r.name}</Text>
            <Text style={styles.routeDetails}>
              ID: {r.id} | {r.totalSteps} steps | {r.legs.length} legs
            </Text>
            <Text style={styles.routeDetails}>
              Recorded: {new Date(r.createdAt).toLocaleString()}
            </Text>
            {r.notes ? (
              <Text style={styles.routeNotes}>Note: {r.notes}</Text>
            ) : null}
            <View style={styles.buttonSpacing}>
              <ActionButton
                label={selectedRoute?.id === r.id ? "Reload Route" : "View Route"}
                hint={`Loads ${r.name} to view details`}
                onPress={() => handleLoadRoute(r.id)}
              />
            </View>
          </View>
        ))
      )}

      {/* Loaded Route Breakdown */}
      {selectedRoute && (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedTitle}>Active / Loaded Route:</Text>
          <Text style={styles.selectedText}>Name: {selectedRoute.name}</Text>
          <Text style={styles.selectedText}>Total steps: {selectedRoute.totalSteps}</Text>
          <Text style={styles.selectedText}>Legs count: {selectedRoute.legs.length}</Text>
          {selectedRoute.legs.map((leg, idx) => (
            <Text key={idx} style={styles.legText}>
              • Leg {idx + 1}: {leg.steps} steps @ {leg.headingDeg}° ({getCardinalDirection(leg.headingDeg)})
              {leg.turnAfterDeg !== null
                ? `, then turn ${leg.turnAfterDeg > 0 ? "right" : "left"} ${Math.abs(leg.turnAfterDeg)}°`
                : " (Arrival)"}
              {leg.label ? ` [Landmark: "${leg.label}"]` : ""}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  disclaimer: {
    fontSize: 13,
    lineHeight: 18,
    color: "#475569",
    marginBottom: 16,
    fontStyle: "italic",
  },
  warningBanner: {
    backgroundColor: "#FDECEC",
    borderColor: "#DC2626",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#DC2626",
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: "#991B1B",
  },
  calibrationBanner: {
    backgroundColor: "#FEF3C7",
    borderColor: "#D97706",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  calibrationTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B45309",
    marginBottom: 4,
  },
  calibrationText: {
    fontSize: 13,
    color: "#92400E",
  },
  sensorStatusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  sensorCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#14213D",
    marginBottom: 4,
  },
  sensorStatusText: {
    fontSize: 14,
    color: "#334155",
  },
  liveStepsHighlight: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F766E",
    marginTop: 6,
  },
  recorderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginBottom: 16,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#14213D",
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  textInput: {
    minHeight: 46,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#14213D",
    marginBottom: 14,
  },
  activeRecordingArea: {
    marginTop: 4,
  },
  recordingBanner: {
    backgroundColor: "#DC2626",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  recordingBannerText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
  landmarkFieldContainer: {
    marginBottom: 8,
  },
  subheading: {
    fontSize: 17,
    fontWeight: "700",
    color: "#14213D",
    marginTop: 12,
    marginBottom: 8,
  },
  statusMessage: {
    fontSize: 14,
    color: "#1B5E20",
    fontWeight: "600",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 12,
  },
  routeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  routeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14213D",
    marginBottom: 4,
  },
  routeDetails: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 2,
  },
  routeNotes: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#D97706",
    marginTop: 2,
  },
  buttonSpacing: {
    marginTop: 8,
  },
  selectedCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginTop: 8,
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#14213D",
    marginBottom: 6,
  },
  selectedText: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 2,
  },
  legText: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
  },
});
