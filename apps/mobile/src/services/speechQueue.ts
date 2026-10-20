/**
 * Decides what gets spoken and when. Pure logic with no Expo imports, so it
 * can be unit tested in Node. The device binding lives in speech.ts.
 *
 * Priorities:
 *   hazard    interrupts whatever is speaking and clears anything waiting.
 *   direction waits for the current utterance to finish. Only the newest
 *             waiting direction is kept, because an older one is stale.
 *   info      is spoken only if nothing else is speaking or waiting.
 */
export type SpeechPriority = "hazard" | "direction" | "info";

export type SpeechHandlers = {
  onDone: () => void;
  onStopped: () => void;
  onError: () => void;
};

export type SpeechEngine = {
  speak(text: string, handlers: SpeechHandlers): void;
  stop(): void;
};

export type SpeechQueueOptions = {
  now?: () => number;
  /** The same text is not spoken again within this window. */
  duplicateWindowMs?: number;
};

export type SayOptions = {
  /** Skip duplicate suppression, for requests the user made on purpose. */
  force?: boolean;
};

type Utterance = { text: string; priority: SpeechPriority };

export class SpeechQueue {
  private readonly engine: SpeechEngine;
  private readonly now: () => number;
  private readonly duplicateWindowMs: number;

  private speaking: Utterance | null = null;
  private pending: Utterance | null = null;
  private lastSpoken: string | null = null;
  private readonly recent = new Map<string, number>();
  /** Callbacks from an utterance that was replaced or stopped are ignored. */
  private generation = 0;
  /** When speech last started or finished. Used to ignore the speaker's own echo. */
  private lastActiveAt = Number.NEGATIVE_INFINITY;

  constructor(engine: SpeechEngine, options: SpeechQueueOptions = {}) {
    this.engine = engine;
    this.now = options.now ?? Date.now;
    this.duplicateWindowMs = options.duplicateWindowMs ?? 2000;
  }

  /** Returns true if the text was spoken or queued, false if it was dropped. */
  say(
    text: string,
    priority: SpeechPriority = "info",
    options: SayOptions = {}
  ): boolean {
    const trimmed = text.trim();
    if (trimmed === "") return false;

    if (!options.force && this.isDuplicate(trimmed)) return false;

    const utterance: Utterance = { text: trimmed, priority };

    if (priority === "hazard") {
      this.pending = null;
      if (this.speaking) this.engine.stop();
      this.start(utterance);
      return true;
    }

    if (this.speaking === null) {
      this.start(utterance);
      return true;
    }

    if (priority === "direction") {
      this.pending = utterance;
      return true;
    }

    return false; // info while busy
  }

  /** Says the last thing that was spoken, even if it was just said. */
  repeatLast(): boolean {
    if (this.lastSpoken === null) return false;
    return this.say(this.lastSpoken, "direction", { force: true });
  }

  /** Stops speech and forgets anything waiting. */
  stop(): void {
    this.pending = null;
    this.generation += 1;
    if (this.speaking) this.engine.stop();
    this.speaking = null;
    this.lastActiveAt = this.now();
  }

  getLastSpoken(): string | null {
    return this.lastSpoken;
  }

  isBusy(): boolean {
    return this.speaking !== null || this.pending !== null;
  }

  /** True when nothing is speaking or waiting, and has not been for `ms`. */
  isQuietFor(ms: number): boolean {
    return !this.isBusy() && this.now() - this.lastActiveAt >= ms;
  }

  private isDuplicate(text: string): boolean {
    const spokenAt = this.recent.get(text);
    return spokenAt !== undefined && this.now() - spokenAt < this.duplicateWindowMs;
  }

  private start(utterance: Utterance): void {
    this.generation += 1;
    const generation = this.generation;
    this.speaking = utterance;
    this.lastActiveAt = this.now();
    this.lastSpoken = utterance.text;
    this.recent.set(utterance.text, this.now());

    const finish = () => {
      if (generation !== this.generation) return;
      this.speaking = null;
      this.lastActiveAt = this.now();
      const next = this.pending;
      this.pending = null;
      if (next) this.start(next);
    };

    this.engine.speak(utterance.text, {
      onDone: finish,
      onStopped: finish,
      onError: finish,
    });
  }
}
