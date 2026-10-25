import { useLayoutEffect, useRef, type RefObject } from 'react';

/** CSS owns the stable reading-column width; only textarea height is measured.
 * Ignore our own height writes so the ResizeObserver cannot feed back on itself. */
export function useComposerSize(value: string, textarea: RefObject<HTMLTextAreaElement>) {
  const form = useRef<HTMLFormElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!input) return;
    let active = true;
    const fit = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.max(44, Math.min(input.scrollHeight, 144))}px`;
    };
    fit();
    let lastWidth = input.clientWidth;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === input && entry.contentRect.width !== lastWidth) {
          lastWidth = entry.contentRect.width;
          fit();
        }
      }
    });
    observer?.observe(input);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(() => { if (active) fit(); });
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [value, textarea]);
  return { form, shell };
}
