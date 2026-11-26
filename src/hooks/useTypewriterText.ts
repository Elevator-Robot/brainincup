import { useEffect, useMemo, useRef, useState } from 'react';

const CHARACTERS_PER_SECOND = 24;
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
export function useTypewriterText(text: string, animate: boolean, position?: number, initialCharacters = 0): string {
  const graphemes = useMemo(() => characters(text), [text]);
  const controlled = useMemo(() => {
    if (position === undefined) return undefined;
    let end = 0, count = 0;
    for (const character of graphemes) {
      if (end + character.length > position) break;
      end += character.length; count++;
    }
    return { text: text.slice(0, end), count };
  }, [graphemes, position, text]);
  const [visible, setVisible] = useState(() => controlled?.text ?? (animate ? text.slice(0, initialCharacters) : text));
  const shown = useRef(visible);
  const target = useRef({ text: '', characters: [] as string[] });
  const count = useRef(characters(visible).length);
  const frame = useRef(0);
  const clock = useRef(0);
  const budget = useRef(0);

  useEffect(() => {
    const corrected = !text.startsWith(target.current.text);
    target.current = { text, characters: graphemes };
    if (controlled || !animate) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      budget.current = 0;
      shown.current = controlled?.text ?? text;
      count.current = controlled?.count ?? graphemes.length;
      setVisible(shown.current);
      return;
    }

    // Final authoritative text may correct a streamed prefix. Keep the reveal
    // budget instead of exposing the entire replacement in one frame.
    if (corrected) {
      count.current = Math.min(count.current, graphemes.length);
      shown.current = graphemes.slice(0, count.current).join('');
      setVisible(shown.current);
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
  }, [text, animate, controlled, graphemes]);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);
  // A voice/loading transition must hide future text on its very first render.
  return controlled?.text ?? visible;
}
