import { useLayoutEffect, useRef, type RefObject } from 'react';

/** CSS owns the stable reading-column width; only textarea height is measured.
 * Ignore our own height writes so the ResizeObserver cannot feed back on itself. */
export function useComposerSize(value: string, textarea: RefObject<HTMLTextAreaElement>, paletteOpen = false) {
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
  useLayoutEffect(() => {
    const anchor = shell.current;
    if (!paletteOpen || !anchor) return;
    const viewport = window.visualViewport;
    const ancestors: HTMLElement[] = [];
    for (let parent = anchor.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    // The menu scrolls within the actual space above the draft, including
    // clipping ancestors and the visible viewport above a software keyboard.
    const fitPalette = () => {
      let top = viewport?.offsetTop ?? 0;
      for (const ancestor of ancestors) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowY)) {
          top = Math.max(top, ancestor.getBoundingClientRect().top);
        }
      }
      anchor.style.setProperty('--composer-palette-space', `${Math.max(0, anchor.getBoundingClientRect().top - top - 16)}px`);
    };
    fitPalette();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitPalette);
    observer?.observe(anchor, { box: 'border-box' });
    ancestors.forEach(ancestor => observer?.observe(ancestor, { box: 'border-box' }));
    window.addEventListener('resize', fitPalette);
    viewport?.addEventListener('resize', fitPalette);
    viewport?.addEventListener('scroll', fitPalette);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', fitPalette);
      viewport?.removeEventListener('resize', fitPalette);
      viewport?.removeEventListener('scroll', fitPalette);
    };
  }, [paletteOpen]);
  return { form, shell };
}
