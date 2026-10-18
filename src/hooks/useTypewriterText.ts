import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

const CHARACTERS_PER_SECOND = 90;
const Segmenter = (Intl as typeof Intl & {
  Segmenter?: new (locale: undefined, options: { granularity: 'grapheme' }) => {
    segment(text: string): Iterable<{ segment: string }>;
  };
}).Segmenter;
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;

function characters(text: string): string[] {
  // Reveal complete graphemes, including accented letters and joined emoji.
  return segmenter
    ? Array.from(segmenter.segment(text), part => part.segment)
    : Array.from(text);
}

/** Presentation-only pacing: authoritative message data stays complete. */
export function useTypewriterText(text: string, animate: boolean): string {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [visible, setVisible] = useState(() => animate && !reducedMotion ? '' : text);
  const shown = useRef(visible);
  const target = useRef({ text: '', characters: [] as string[] });
  const count = useRef(0);
  const frame = useRef(0);
  const clock = useRef(0);
  const budget = useRef(0);

  useEffect(() => {
    const corrected = !text.startsWith(target.current.text);
    target.current = { text, characters: characters(text) };
    if (!animate || reducedMotion || corrected) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      budget.current = 0;
      shown.current = text;
      count.current = target.current.characters.length;
      setVisible(text);
      return;
    }

    // A chunk can finish an already-visible combining character or joined emoji.
    const prefix = target.current.characters.slice(0, count.current).join('');
    if (prefix !== shown.current && prefix.startsWith(shown.current)) {
      shown.current = prefix;
      setVisible(prefix);
    }

    const tick = (time: number) => {
      // Don't dump a whole response after a background tab becomes visible.
      budget.current += Math.min(time - clock.current, 48) * CHARACTERS_PER_SECOND / 1000;
      clock.current = time;
      const available = target.current.characters;
      const next = Math.min(available.length, count.current + Math.floor(budget.current));
      if (next > count.current) {
        budget.current -= next - count.current;
        shown.current += available.slice(count.current, next).join('');
        count.current = next;
        setVisible(shown.current);
      }
      frame.current = count.current < available.length ? requestAnimationFrame(tick) : 0;
    };

    // Incoming chunks update the target without resetting an active reveal.
    if (!frame.current && count.current < target.current.characters.length) {
      clock.current = performance.now();
      budget.current = 0;
      frame.current = requestAnimationFrame(tick);
    }
  }, [text, animate, reducedMotion]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  return visible;
}
