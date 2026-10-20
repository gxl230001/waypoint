import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeTransition,
  IDLE,
  resolveTarget,
  sosReducer,
  type HapticKind,
  type SosAction,
  type SosContact,
  type SosReason,
  type SosState,
} from "./sosMachine";

export type SosEffects = {
  speak: (text: string) => void;
  haptic: (kind: HapticKind) => void;
  /** The saved emergency contact, or null to use the default demo number. */
  getContact: () => SosContact | null;
};

export type UseSos = {
  state: SosState;
  trigger: (reason?: SosReason) => void;
  confirm: () => void;
  cancel: () => void;
  dismiss: () => void;
};

export function useSos(effects: SosEffects): UseSos {
  const [state, setState] = useState<SosState>(IDLE);
  const stateRef = useRef<SosState>(IDLE);
  const effectsRef = useRef(effects);
  effectsRef.current = effects;

  const apply = useCallback((action: SosAction) => {
    const prev = stateRef.current;
    const next = sosReducer(prev, action);
    if (next === prev) return;

    stateRef.current = next;
    setState(next);

    const effect = describeTransition(prev, next);
    if (!effect) return;
    if (effect.speech) effectsRef.current.speak(effect.speech);
    if (effect.haptic) effectsRef.current.haptic(effect.haptic);
  }, []);

  const active = state.phase === "countdown" || state.phase === "confirm";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      apply({ type: "tick", nowMs: Date.now() });
    }, 250);
    return () => clearInterval(timer);
  }, [active, apply]);

  const trigger = useCallback(
    (reason: SosReason = "manual") => {
      apply({
        type: "trigger",
        reason,
        target: resolveTarget(effectsRef.current.getContact()),
        nowMs: Date.now(),
      });
    },
    [apply]
  );

  const confirm = useCallback(() => apply({ type: "confirm" }), [apply]);
  const cancel = useCallback(() => apply({ type: "cancel" }), [apply]);
  const dismiss = useCallback(() => apply({ type: "dismiss" }), [apply]);

  return { state, trigger, confirm, cancel, dismiss };
}
