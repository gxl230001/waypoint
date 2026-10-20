/**
 * Turns what the user said into one app command. Pure logic with no Expo
 * imports so it can be unit tested in Node.
 *
 * The match is keyword based on purpose: it is predictable, works offline and
 * is easy to extend. Order matters, and safety wins: anything that sounds like
 * a request for emergency help is checked first.
 */
export type VoiceCommand =
  | "cancelSos"
  | "sos"
  | "repeat"
  | "settings"
  | "userView"
  | "status"
  | "stopNavigation"
  | "startNavigation"
  | "help"
  | "unknown";

const RULES: ReadonlyArray<{ command: VoiceCommand; pattern: RegExp }> = [
  {
    command: "cancelSos",
    pattern:
      /\b(cancel sos|false alarm|i am okay|im okay|i am ok|im ok|i am fine|im fine)\b/,
  },
  {
    command: "sos",
    pattern:
      /\b(sos|emergency|help me|need help|call 911|call for help|i fell|i have fallen|i fell down)\b/,
  },
  { command: "repeat", pattern: /\b(repeat|say that again|again|what did you say)\b/ },
  { command: "userView", pattern: /\b(user view|main screen|home screen|go home|go back)\b/ },
  { command: "settings", pattern: /\b(settings?|options|preferences)\b/ },
  { command: "status", pattern: /\b(status|where am i|what is happening)\b/ },
  { command: "stopNavigation", pattern: /\b(stop|end|pause|quit)\b/ },
  { command: "startNavigation", pattern: /\b(start|begin|go|navigate|navigation)\b/ },
  { command: "help", pattern: /\b(help|commands|what can i say)\b/ },
];

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCommand(text: string): VoiceCommand {
  const normalized = normalizeSpeech(text);
  if (normalized === "") return "unknown";
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.command;
  }
  return "unknown";
}

export const HELP_TEXT =
  "You can say: start navigation, stop, repeat, status, settings, user view, I am okay, or help me for emergencies.";

export type SosPhase = "idle" | "countdown" | "confirm" | "called";
export type SosReply = "confirm" | "cancel" | "dismiss";

const SOS_CANCEL =
  /\b(cancel sos|false alarm|i am okay|im okay|i am ok|im ok|i am fine|im fine|i am alright|im alright|cancel|no|stop)\b/;
const SOS_CONFIRM = /\b(yes|yeah|yep|call|help|help me|need help)\b/;
const SOS_DISMISS = /\b(done|ok|okay|close|dismiss|thanks|thank you)\b/;

/**
 * What a spoken reply means while the SOS flow is on screen. Returns null for
 * anything that is not a clear answer, so background talk is ignored. Cancel
 * is checked first so "no, I am okay" can never start a call.
 */
export function parseSosReply(text: string, phase: SosPhase): SosReply | null {
  const normalized = normalizeSpeech(text);
  if (normalized === "") return null;

  if (phase === "countdown") {
    return SOS_CANCEL.test(normalized) ? "cancel" : null;
  }
  if (phase === "confirm") {
    if (SOS_CANCEL.test(normalized)) return "cancel";
    return SOS_CONFIRM.test(normalized) ? "confirm" : null;
  }
  if (phase === "called") {
    return SOS_DISMISS.test(normalized) || SOS_CANCEL.test(normalized)
      ? "dismiss"
      : null;
  }
  return null;
}
