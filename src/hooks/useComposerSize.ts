import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Measure actual glyph widths; keep all resizing local to the composer. */
export function useComposerSize(value: string, textarea: RefObject<HTMLTextAreaElement>) {
  const form = useRef<HTMLFormElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const input = textarea.current;
    const container = form.current;
    const surface = shell.current;
    const mirror = measure.current;
    if (!input || !container || !surface || !mirror) return;
    let active = true;
    const px = (size: string) => Number.parseFloat(size) || 0;
    const fitWidth = () => {
      const textStyle = getComputedStyle(input);
      mirror.style.font = textStyle.font;
      mirror.style.letterSpacing = textStyle.letterSpacing;
      const shellStyle = getComputedStyle(surface);
      const button = surface.querySelector<HTMLButtonElement>('button');
      const chrome = px(shellStyle.paddingLeft) + px(shellStyle.paddingRight)
        + px(shellStyle.borderLeftWidth) + px(shellStyle.borderRightWidth)
        + px(textStyle.paddingLeft) + px(textStyle.paddingRight)
        + px(shellStyle.columnGap) + (button?.offsetWidth || 44) + 18;
      const minimum = 20 * (px(getComputedStyle(document.documentElement).fontSize) || 16);
      const available = container.clientWidth || minimum;
      const width = Math.min(available, Math.max(minimum, mirror.getBoundingClientRect().width + chrome));
      surface.style.setProperty('--composer-width', `${width}px`);
      container.style.setProperty('--composer-width', `${width}px`);
    };
    const fitHeight = () => {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
    };
    const fit = () => { fitWidth(); fitHeight(); };
    fit();

    let lastFormWidth = container.clientWidth;
    let lastInputWidth = -1;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === container && entry.contentRect.width !== lastFormWidth) {
          lastFormWidth = entry.contentRect.width;
          fitWidth();
        }
        // Rewrap during the width animation without reacting to our own height writes.
        if (entry.target === input && entry.contentRect.width !== lastInputWidth) {
          lastInputWidth = entry.contentRect.width;
          fitHeight();
        }
      }
    });
    observer?.observe(container);
    observer?.observe(input);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(() => { if (active) fit(); });
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [value, textarea]);

  return { form, shell, measure };
}
