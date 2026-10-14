/**
 * SOS countdown state machine. Pure logic with no Expo or React imports, so it
 * can be unit tested in Node.
 *
 * THIS IS A DEMO. Nothing here places a real call or sends a message. When the
 * flow finishes it only describes the call that would have been made. Do not
 * add dialing (Linking, tel:) to this module.
 *
 * Flow:
 *   idle -> countdown (user can cancel)
 *        -> confirm   (user must say yes, or can cancel)
 *        -> called    (demo popup, no real call)
 *
 * If the user does not answer the confirmation in time the flow continues,
 * because someone who has fallen may not be able to touch the phone.
 *
 * Times are deadlines (epoch ms) instead of counters, so the countdown stays
 * correct if the app was in the background and a tick arrives late.
 */
export const COUNTDOWN_SECONDS = 10;
export const CONFIRM_SECONDS = 10;

export type SosReason = "manual" | "fall" | "voice";

export type SosContact = { name: string; phone: string };

export type SosTarget =
  | { kind: "contact"; name: string; phone: string }
  | { kind: "emergency"; name: string };

export type SosState =
  | { phase: "idle" }
  | {
      phase: "countdown";
      reason: SosReason;
      target: SosTarget;
      secondsLeft: number;
      endsAtMs: number;
    }
  | {
      phase: "confirm";
      reason: SosReason;
      target: SosTarget;
      secondsLeft: number;
      endsAtMs: number;
    }
  | {
      phase: "called";
      reason: SosReason;
      target: SosTarget;
      /** True when the user did not answer and the flow continued on its own. */
      autoProceeded: boolean;
    };

export type SosAction =
  | { type: "trigger"; reason: SosReason; target: SosTarget; nowMs: number }
  | { type: "tick"; nowMs: number }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "dismiss" };

export const IDLE: SosState = { phase: "idle" };

/** The emergency contact if there is one, otherwise the default demo number. */
export function resolveTarget(contact: SosContact | null): SosTarget {
  if (contact) {
    return { kind: "contact", name: contact.name, phone: contact.phone };
  }
  return { kind: "emergency", name: "emergency services (911, demo)" };
}

export function targetLabel(target: SosTarget): string {
  return target.kind === "contact"
    ? `${target.name} at ${target.phone}`
    : target.name;
}

/** What the final popup says. Always makes clear that no call was placed. */
export function describeDemoCall(target: SosTarget): string {
  return `Demo only. This would call ${targetLabel(target)}. No real call was placed.`;
}

function secondsUntil(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

export function sosReducer(state: SosState, action: SosAction): SosState {
  switch (action.type) {
    case "trigger": {
      if (state.phase !== "idle") return state; // never restart a running flow
      return {
        phase: "countdown",
        reason: action.reason,
        target: action.target,
        secondsLeft: COUNTDOWN_SECONDS,
        endsAtMs: action.nowMs + COUNTDOWN_SECONDS * 1000,
      };
    }

    case "tick": {
      if (state.phase === "countdown") {
        const left = secondsUntil(state.endsAtMs, action.nowMs);
        if (left > 0) {
          return left === state.secondsLeft ? state : { ...state, secondsLeft: left };
        }
        return {
          phase: "confirm",
          reason: state.reason,
          target: state.target,
          secondsLeft: CONFIRM_SECONDS,
          endsAtMs: action.nowMs + CONFIRM_SECONDS * 1000,
        };
      }
      if (state.phase === "confirm") {
        const left = secondsUntil(state.endsAtMs, action.nowMs);
        if (left > 0) {
          return left === state.secondsLeft ? state : { ...state, secondsLeft: left };
        }
        return {
          phase: "called",
          reason: state.reason,
          target: state.target,
          autoProceeded: true,
        };
      }
      return state;
    }

    case "confirm": {
      if (state.phase !== "confirm") return state;
      return {
        phase: "called",
        reason: state.reason,
        target: state.target,
        autoProceeded: false,
      };
    }

    case "cancel": {
      if (state.phase === "countdown" || state.phase === "confirm") return IDLE;
      return state;
    }

    case "dismiss": {
      return state.phase === "called" ? IDLE : state;
    }
  }
}

export type HapticKind = "tick" | "warning" | "done";

export type TransitionEffect = {
  speech?: string;
  haptic?: HapticKind;
};

const SPOKEN_SECONDS = new Set([5, 3, 2, 1]);

/** What to say and feel when the state changes. Null means do nothing. */
export function describeTransition(
  prev: SosState,
  next: SosState
): TransitionEffect | null {
  if (prev === next) return null;

  if (prev.phase === "idle" && next.phase === "countdown") {
    return {
      speech:
        `Emergency help requested. Calling ${targetLabel(next.target)} in ` +
        `${next.secondsLeft} seconds. Tap cancel if you are okay.`,
      haptic: "warning",
    };
  }

  if (prev.phase === "countdown" && next.phase === "countdown") {
    return {
      speech: SPOKEN_SECONDS.has(next.secondsLeft) ? String(next.secondsLeft) : undefined,
      haptic: "tick",
    };
  }

  if (next.phase === "confirm" && prev.phase === "countdown") {
    return {
      speech:
        `Do you need help? Tap yes to call ${targetLabel(next.target)}, or tap no to ` +
        `cancel. Calling automatically in ${next.secondsLeft} seconds.`,
      haptic: "warning",
    };
  }

  if (prev.phase === "confirm" && next.phase === "confirm") {
    return {
      speech: SPOKEN_SECONDS.has(next.secondsLeft) ? String(next.secondsLeft) : undefined,
      haptic: "tick",
    };
  }

  if (next.phase === "called") {
    return { speech: describeDemoCall(next.target), haptic: "done" };
  }

  if (
    next.phase === "idle" &&
    (prev.phase === "countdown" || prev.phase === "confirm")
  ) {
    return { speech: "Emergency call cancelled.", haptic: "done" };
  }

  return null;
}
