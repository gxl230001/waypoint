/**
 * The seam between the "Tap to speak" button and a speech-to-text engine.
 *
 * No recognizer is installed yet: on-device speech recognition needs a native
 * module, which Expo Go does not include, so it requires a development build.
 * When one is added, implement VoiceRecognizer and pass it to the app. The
 * rest of the voice flow (command parsing, dispatch) already works.
 */
export type VoiceRecognizer = {
  isAvailable(): boolean;
  /** Listens once and resolves with the recognized text, or null if nothing was heard. */
  listen(): Promise<string | null>;
};

export const unavailableRecognizer: VoiceRecognizer = {
  isAvailable: () => false,
  listen: async () => null,
};
