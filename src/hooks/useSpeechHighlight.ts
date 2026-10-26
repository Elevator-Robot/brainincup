import { useEffect, type RefObject } from 'react';
import type { SpeechPlayback } from '../chat/speech';
import { createSpeechTimeline, sentenceAt, sentenceRange, speechSentences } from '../utils/speechHighlight';

let owner: symbol | null = null;
const NAME = 'brain-speech';
type HighlightRuntime = { CSS?: { highlights?: { set: (name: string, highlight: unknown) => void; delete: (name: string) => void } }; Highlight?: new (...ranges: Range[]) => unknown };

/** Reads the media clock, never an independent typing timer. Highlighting does
 * not mutate Markdown, steal text selection, move focus, or force scrolling. */
export function useSpeechHighlight(root: RefObject<HTMLDivElement>, playback: SpeechPlayback | undefined, renderedText: string) {
  useEffect(() => {
    const element = root.current;
    if (!element || !playback?.alignment) return;
    const token = Symbol(NAME);
    const runtime = globalThis as unknown as HighlightRuntime;
    const registry = runtime.CSS?.highlights;
    const audio = playback.audio;
    const at = createSpeechTimeline(playback.alignment);
    const sentences = speechSentences(playback.text);
    let frame = 0, current = -1, buffering = false;
    let fallback: Element | null = null;
    const playing = () => !playback.signal?.aborted && !document.hidden && !buffering
      && !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3;
    const clear = () => {
      if (owner === token) { registry?.delete(NAME); owner = null; }
      fallback?.classList.remove('cosmic-speech-current'); fallback = null;
      delete element.dataset.speechActive;
      current = -1;
    };
    const update = () => {
      if (!playing()) { clear(); return; }
      const character = at(audio.currentTime);
      const sentence = character === null ? undefined : sentenceAt(sentences, playback.offset + character);
      if (!sentence) { clear(); return; }
      if (current === sentence.start) return;
      clear();
      const range = sentenceRange(element, sentence, playback.text);
      if (!range) return; // No approximate/fabricated match for omitted content.
      if (registry && runtime.Highlight) { registry.set(NAME, new runtime.Highlight(range)); owner = token; }
      else {
        // Older browsers retain a coarse active-paragraph cue without replacing
        // text nodes or changing the message's accessibility/selection semantics.
        const parent = range.startContainer.parentElement?.closest('p, li, blockquote, h1, h2, h3');
        fallback = parent && element.contains(parent) ? parent : element;
        fallback.classList.add('cosmic-speech-current');
      }
      element.dataset.speechActive = 'true';
      current = sentence.start;
    };
    const tick = () => {
      update();
      frame = playing() ? requestAnimationFrame(tick) : 0;
    };
    const resume = () => { update(); if (!frame && playing()) frame = requestAnimationFrame(tick); };
    const suspend = () => { cancelAnimationFrame(frame); frame = 0; clear(); };
    const wait = () => { buffering = true; suspend(); };
    const play = () => { buffering = false; resume(); };
    const visibility = () => { if (document.hidden) suspend(); else resume(); };
    const events: Array<[string, () => void]> = [
      ['playing', play], ['seeked', play], ['timeupdate', resume], ['ratechange', resume],
      ['waiting', wait], ['stalled', wait], ['seeking', suspend], ['pause', suspend], ['ended', suspend], ['error', suspend],
    ];
    events.forEach(([name, listener]) => audio.addEventListener(name, listener));
    document.addEventListener('visibilitychange', visibility);
    playback.signal?.addEventListener('abort', suspend, { once: true });
    resume();
    return () => {
      suspend();
      events.forEach(([name, listener]) => audio.removeEventListener(name, listener));
      document.removeEventListener('visibilitychange', visibility);
      playback.signal?.removeEventListener('abort', suspend);
    };
  }, [root, playback, renderedText]);
}
