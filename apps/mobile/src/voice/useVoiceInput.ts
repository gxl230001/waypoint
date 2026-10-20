import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  createExpoEngine,
  isVoiceInputAvailable,
  requestVoicePermission,
} from "./expoEngine";
import { ListeningLoop } from "./listeningLoop";

export type VoiceStatus = "unavailable" | "off" | "listening" | "denied";

export type UseVoiceInput = {
  status: VoiceStatus;
  /** Asks for permission if needed, then starts listening. */
  enable: () => Promise<void>;
};

/**
 * Keeps the microphone listening for the whole life of the app, and pauses it
 * while the app is in the background (the OS does not allow listening there).
 * `onTranscript` is called with every partial and final phrase heard.
 */
export function useVoiceInput(
  onTranscript: (text: string, isFinal: boolean) => void
): UseVoiceInput {
  const [status, setStatus] = useState<VoiceStatus>(
    isVoiceInputAvailable() ? "off" : "unavailable"
  );
  const loopRef = useRef<ListeningLoop | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const enable = useCallback(async () => {
    if (!isVoiceInputAvailable()) {
      setStatus("unavailable");
      return;
    }
    if (!(await requestVoicePermission())) {
      setStatus("denied");
      return;
    }
    if (loopRef.current === null) {
      loopRef.current = new ListeningLoop(createExpoEngine(), {
        onTranscript: (text, isFinal) => transcriptRef.current(text, isFinal),
        onStatus: (s) =>
          setStatus(s === "listening" ? "listening" : s === "denied" ? "denied" : "off"),
      });
    }
    loopRef.current.start();
  }, []);

  useEffect(() => {
    void enable();
    const subscription = AppState.addEventListener("change", (state) => {
      const loop = loopRef.current;
      if (state === "active") void enable();
      else loop?.stop();
    });
    return () => {
      subscription.remove();
      loopRef.current?.stop();
    };
  }, [enable]);

  return { status, enable };
}
