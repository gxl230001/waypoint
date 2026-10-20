/**
 * Keeps speech recognition running. Phone recognizers stop on their own after
 * a pause or an error, so this restarts them, backs off if they keep failing,
 * and gives up only when the microphone is not allowed. Pure logic with no
 * Expo imports so it can be unit tested in Node.
 */
export type LoopHandlers = {
  onResult: (text: string, isFinal: boolean) => void;
  /** The recognizer session finished (silence, timeout, or error). */
  onEnd: () => void;
  /** `code` is the recognizer's error code, for example "not-allowed". */
  onError: (code: string) => void;
};

export type LoopEngine = {
  setHandlers(handlers: LoopHandlers): void;
  startSession(): void;
  abort(): void;
};

export type LoopStatus = "stopped" | "listening" | "denied";

export type ListeningLoopOptions = {
  onTranscript: (text: string, isFinal: boolean) => void;
  onStatus?: (status: LoopStatus) => void;
  restartDelayMs?: number;
  maxDelayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

const FATAL_ERRORS = new Set(["not-allowed", "service-not-allowed", "language-not-supported"]);

export class ListeningLoop {
  private wanted = false;
  private failures = 0;
  private timer: unknown = null;
  private status: LoopStatus = "stopped";

  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(
    private readonly engine: LoopEngine,
    private readonly options: ListeningLoopOptions
  ) {
    this.baseDelay = options.restartDelayMs ?? 250;
    this.maxDelay = options.maxDelayMs ?? 4000;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as never));

    engine.setHandlers({
      onResult: (text, isFinal) => {
        this.failures = 0;
        if (this.wanted) this.options.onTranscript(text, isFinal);
      },
      onEnd: () => this.scheduleRestart(),
      onError: (code) => {
        if (FATAL_ERRORS.has(code)) {
          this.wanted = false;
          this.cancelTimer();
          this.setStatus("denied");
          return;
        }
        // "no-speech", "network", "aborted"... Try again, a bit slower each time.
        this.failures += 1;
      },
    });
  }

  getStatus(): LoopStatus {
    return this.status;
  }

  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.failures = 0;
    this.beginSession();
  }

  stop(): void {
    this.wanted = false;
    this.cancelTimer();
    this.engine.abort();
    this.setStatus("stopped");
  }

  private beginSession(): void {
    if (!this.wanted) return;
    this.setStatus("listening");
    this.engine.startSession();
  }

  private scheduleRestart(): void {
    if (!this.wanted || this.timer !== null) return;
    const delay = Math.min(this.maxDelay, this.baseDelay * 2 ** this.failures);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.beginSession();
    }, delay);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: LoopStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }
}
