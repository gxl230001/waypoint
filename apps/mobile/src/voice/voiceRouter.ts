/**
 * Decides what a transcript from the always-on microphone means. Pure logic
 * with no Expo imports so it can be unit tested in Node.
 *
 * The microphone is open all the time, so this is deliberately cautious:
 * - it ignores anything heard while the app is speaking (its own voice),
 * - while SOS is on screen it only accepts clear answers to the SOS prompt,
 * - otherwise it only acts on finished, short phrases, and stays silent on
 *   anything it does not understand instead of nagging.
 */
import {
  parseCommand,
  parseSosReply,
  type SosPhase,
  type SosReply,
  type VoiceCommand,
} from "./commands";

export const MAX_COMMAND_WORDS = 8;

export type VoiceContext = {
  sosPhase: SosPhase;
  /** True while the app is speaking, or just stopped speaking. */
  assistantSpeaking: boolean;
};

export type VoiceAction =
  | { type: "command"; command: Exclude<VoiceCommand, "unknown"> }
  | { type: "sosReply"; reply: SosReply };

export function routeTranscript(
  text: string,
  isFinal: boolean,
  context: VoiceContext
): VoiceAction | null {
  if (context.assistantSpeaking) return null;

  if (context.sosPhase !== "idle") {
    // Interim results are fine here: "I am okay" should work right away.
    const reply = parseSosReply(text, context.sosPhase);
    return reply ? { type: "sosReply", reply } : null;
  }

  if (!isFinal) return null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_COMMAND_WORDS) return null;

  const command = parseCommand(text);
  return command === "unknown" ? null : { type: "command", command };
}
