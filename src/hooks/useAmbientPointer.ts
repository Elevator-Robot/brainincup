import { useEffect, type RefObject } from 'react';
import { useMediaQuery } from './useMediaQuery';
import { usePageVisible } from './usePageVisible';

/** Low-amplitude, transform-only parallax. No React updates per pointer move;
 * no perpetual frame loop, touch tracking, or work in a hidden tab. */
export function useAmbientPointer(surface: RefObject<HTMLDivElement>) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fine = useMediaQuery('(hover: hover) and (pointer: fine)');
  const visible = usePageVisible();
  useEffect(() => {
    const element = surface.current;
    if (!element || reduced || !fine || !visible) return;
    let frame = 0;
    let last = 0;
    let x = 0; let y = 0;
    let targetX = 0; let targetY = 0;
    const settle = (now: number) => {
      const elapsed = last ? Math.min(64, now - last) : 16;
      last = now;
      const ease = 1 - Math.exp(-elapsed / 240);
      x += (targetX - x) * ease; y += (targetY - y) * ease;
      const moving = Math.abs(targetX - x) + Math.abs(targetY - y) > .04;
      if (!moving) { x = targetX; y = targetY; }
      element.style.setProperty('--ambient-x', `${x.toFixed(2)}px`);
      element.style.setProperty('--ambient-y', `${y.toFixed(2)}px`);
      frame = moving ? requestAnimationFrame(settle) : 0;
      if (!moving) last = 0;
    };
    const start = () => { if (!frame) frame = requestAnimationFrame(settle); };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons) return;
      targetX = Math.max(-1, Math.min(1, event.clientX / Math.max(1, innerWidth) * 2 - 1)) * 14;
      targetY = Math.max(-1, Math.min(1, event.clientY / Math.max(1, innerHeight) * 2 - 1)) * 10;
      start();
    };
    const reset = () => { targetX = 0; targetY = 0; start(); };
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      element.style.removeProperty('--ambient-x');
      element.style.removeProperty('--ambient-y');
    };
  }, [surface, reduced, fine, visible]);
}
