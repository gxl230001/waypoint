/**
 * Binds the listening loop to the device's speech recognizer
 * (expo-speech-recognition). This is the only file that imports it.
 *
 * The library is native code, so it is missing in Expo Go. It is loaded lazily
 * and every call is guarded, so the app still starts there and just reports
 * that voice input is unavailable. Use a development build for the real thing.
 */
import type { LoopEngine, LoopHandlers } from "./listeningLoop";

type Subscription = { remove: () => void };

type RecognitionModule = {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: Record<string, unknown>): void;
  abort(): void;
  addListener(event: string, listener: (event: any) => void): Subscription;
};

function loadModule(): RecognitionModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require("expo-speech-recognition");
    return (lib.ExpoSpeechRecognitionModule as RecognitionModule) ?? null;
  } catch {
    return null;
  }
}

const mod = loadModule();

export function isVoiceInputAvailable(): boolean {
  try {
    return mod !== null && mod.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/** Asks for microphone and speech permission. Resolves false if refused. */
export async function requestVoicePermission(): Promise<boolean> {
  if (mod === null) return false;
  try {
    return (await mod.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const SESSION_OPTIONS = {
  lang: "en-US",
  interimResults: true,
  continuous: true,
  maxAlternatives: 1,
  // Short phrases the app cares about, so they are recognized more reliably.
  contextualStrings: [
    "I am okay",
    "I'm okay",
    "false alarm",
    "cancel SOS",
    "start navigation",
    "stop navigation",
    "help me",
    "settings",
    "repeat",
    "status",
  ],
  iosTaskHint: "confirmation",
  iosCategory: {
    category: "playAndRecord",
    categoryOptions: ["defaultToSpeaker", "allowBluetooth", "mixWithOthers"],
    mode: "default",
  },
};

export function createExpoEngine(): LoopEngine {
  let subscriptions: Subscription[] = [];

  function detach() {
    subscriptions.forEach((s) => s.remove());
    subscriptions = [];
  }

  return {
    setHandlers(handlers: LoopHandlers) {
      if (mod === null) return;
      detach();
      subscriptions = [
        mod.addListener("result", (event) => {
          const transcript: string | undefined = event?.results?.[0]?.transcript;
          if (transcript) handlers.onResult(transcript, Boolean(event.isFinal));
        }),
        mod.addListener("end", () => handlers.onEnd()),
        mod.addListener("error", (event) => handlers.onError(String(event?.error ?? "unknown"))),
      ];
    },
    startSession() {
      try {
        mod?.start(SESSION_OPTIONS);
      } catch (e) {
        console.warn("Could not start speech recognition:", e);
      }
    },
    abort() {
      try {
        mod?.abort();
      } catch {
        // Nothing running.
      }
    },
  };
}
