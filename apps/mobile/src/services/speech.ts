import * as Speech from "expo-speech";
import {
  SpeechQueue,
  type SayOptions,
  type SpeechEngine,
  type SpeechPriority,
} from "./speechQueue";

/**
 * The one place the app talks to expo-speech. Other code calls speak() with a
 * priority instead of using Speech directly, so messages never overlap.
 */
let rateProvider: () => number = () => 1;

/** Lets settings supply the speech rate later without this file importing them. */
export function setSpeechRateProvider(provider: () => number): void {
  rateProvider = provider;
}

const engine: SpeechEngine = {
  speak(text, handlers) {
    Speech.speak(text, {
      rate: rateProvider(),
      onDone: handlers.onDone,
      onStopped: handlers.onStopped,
      onError: handlers.onError,
    });
  },
  stop() {
    void Speech.stop();
  },
};

const queue = new SpeechQueue(engine);

export function speak(
  text: string,
  priority: SpeechPriority = "info",
  options?: SayOptions
): boolean {
  return queue.say(text, priority, options);
}

export function repeatLastSpoken(): boolean {
  return queue.repeatLast();
}

export function stopSpeaking(): void {
  queue.stop();
}

export function lastSpoken(): string | null {
  return queue.getLastSpoken();
}
