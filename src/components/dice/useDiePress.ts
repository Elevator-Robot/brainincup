import { useCallback, useEffect, useRef } from 'react';

type DiePointer = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button'>;

/** A press must start and finish on the asset; dragging/scrolling cancels it. */
export function useDiePress(enabled: boolean, onActivate: () => void, feedback: (pressed: boolean) => void) {
  const start = useRef<DiePointer | null>(null);
  const current = useRef({ enabled, onActivate, feedback });
  current.current = { enabled, onActivate, feedback };
  const cancel = useCallback(() => {
    if (start.current) current.current.feedback(false);
    start.current = null;
  }, []);
  useEffect(() => { if (!enabled) cancel(); return cancel; }, [enabled, cancel]);
  useEffect(() => {
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('scroll', cancel, true);
    return () => {
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('scroll', cancel, true);
    };
  }, [cancel]);

  const down = useCallback((event: DiePointer) => {
    if (!current.current.enabled || event.button !== 0) return;
    start.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, button: event.button };
    current.current.feedback(true);
  }, []);
  const move = useCallback((event: DiePointer) => {
    if (start.current && Math.hypot(event.clientX - start.current.clientX, event.clientY - start.current.clientY) > 8) cancel();
  }, [cancel]);
  const up = useCallback((event: DiePointer) => {
    const origin = start.current;
    const valid = origin && origin.pointerId === event.pointerId && current.current.enabled &&
      Math.hypot(event.clientX - origin.clientX, event.clientY - origin.clientY) <= 8;
    cancel();
    if (valid) current.current.onActivate();
  }, [cancel]);
  const keyboard = useCallback(() => {
    if (current.current.enabled) current.current.onActivate();
  }, []);
  return { down, move, up, cancel, keyboard };
}
