/**
 * Settings shape, defaults and validation. Pure logic with no Expo imports so
 * it can be unit tested in Node. Persistence lives in settingsStore.ts.
 */
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;
export const SPEECH_RATE_STEP = 0.25;

export const TEXT_SCALES = [1, 1.25, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export const VERBOSITY_LEVELS = ["minimal", "normal", "detailed"] as const;
export type Verbosity = (typeof VERBOSITY_LEVELS)[number];

export type EmergencyContact = {
  name: string;
  phone: string;
};

export type Settings = {
  /** 1 is the normal speaking rate. Passed to the speech engine. */
  speechRate: number;
  verbosity: Verbosity;
  hapticsEnabled: boolean;
  textScale: TextScale;
  highContrast: boolean;
  /** Null until the user adds one. SOS falls back to the demo emergency number. */
  emergencyContact: EmergencyContact | null;
};

export const DEFAULT_SETTINGS: Settings = {
  speechRate: 1,
  verbosity: "normal",
  hapticsEnabled: true,
  textScale: 1,
  highContrast: false,
  emergencyContact: null,
};

const PHONE_PATTERN = /^[0-9+()\-.\s]{5,20}$/;

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  return PHONE_PATTERN.test(trimmed) && /[0-9]{4,}/.test(trimmed.replace(/\D/g, ""));
}

export function clampSpeechRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.speechRate;
  const clamped = Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, value));
  // Snap to the step so repeated +/- never drifts (0.75, 1, 1.25, ...).
  return Math.round(clamped / SPEECH_RATE_STEP) * SPEECH_RATE_STEP;
}

function normalizeContact(raw: unknown): EmergencyContact | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { name, phone } = raw as Record<string, unknown>;
  if (typeof name !== "string" || typeof phone !== "string") return null;
  const cleanName = name.trim().slice(0, 60);
  const cleanPhone = phone.trim();
  if (cleanName === "" || !isValidPhone(cleanPhone)) return null;
  return { name: cleanName, phone: cleanPhone };
}

/**
 * Turns whatever was read from disk into a valid Settings object. Unknown or
 * invalid fields fall back to defaults, so a corrupt or older file never
 * breaks the app.
 */
export function normalizeSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;

  return {
    speechRate:
      typeof r.speechRate === "number"
        ? clampSpeechRate(r.speechRate)
        : DEFAULT_SETTINGS.speechRate,
    verbosity: VERBOSITY_LEVELS.includes(r.verbosity as Verbosity)
      ? (r.verbosity as Verbosity)
      : DEFAULT_SETTINGS.verbosity,
    hapticsEnabled:
      typeof r.hapticsEnabled === "boolean"
        ? r.hapticsEnabled
        : DEFAULT_SETTINGS.hapticsEnabled,
    textScale: TEXT_SCALES.includes(r.textScale as TextScale)
      ? (r.textScale as TextScale)
      : DEFAULT_SETTINGS.textScale,
    highContrast:
      typeof r.highContrast === "boolean"
        ? r.highContrast
        : DEFAULT_SETTINGS.highContrast,
    emergencyContact: normalizeContact(r.emergencyContact),
  };
}

export function stepSpeechRate(current: number, direction: 1 | -1): number {
  return clampSpeechRate(current + direction * SPEECH_RATE_STEP);
}

export function nextTextScale(current: TextScale): TextScale {
  const index = TEXT_SCALES.indexOf(current);
  return TEXT_SCALES[(index + 1) % TEXT_SCALES.length];
}

export function nextVerbosity(current: Verbosity): Verbosity {
  const index = VERBOSITY_LEVELS.indexOf(current);
  return VERBOSITY_LEVELS[(index + 1) % VERBOSITY_LEVELS.length];
}
