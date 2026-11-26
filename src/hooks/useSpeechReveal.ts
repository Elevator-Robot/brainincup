import { useEffect, useState } from 'react';
import type { SpeechPlayback } from '../chat/speech';
import { createSpeechTimeline } from '../utils/speechReveal';

/** Media-clock reveal. Preparing a chunk holds its boundary; neither animation
 * time nor playbackRate is used to estimate the spoken position. */
export function useSpeechReveal(playback?: SpeechPlayback): number | undefined {
  const [position, setPosition] = useState<{ playback: SpeechPlayback; count: number; completed: boolean }>();
  useEffect(() => {
    if (!playback) { setPosition(undefined); return; }
    const { audio, alignment, offset, signal } = playback;
    const at = alignment ? createSpeechTimeline(alignment) : null;
    let frame = 0, buffering = false;
    const set = (count: number, completed = false) => setPosition(previous =>
      previous?.playback === playback && previous.count === count && previous.completed === completed
        ? previous : { playback, count, completed });
    const playing = () => !signal?.aborted && !document.hidden && !buffering
      && !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3;
    const update = () => {
      if (at && !signal?.aborted && !buffering && !audio.seeking && audio.readyState >= 2) {
        set(offset + at(audio.currentTime));
      }
    };
    const tick = () => { update(); frame = playing() ? requestAnimationFrame(tick) : 0; };
    const resume = () => { update(); if (!frame && playing() && at) frame = requestAnimationFrame(tick); };
    const suspend = () => { cancelAnimationFrame(frame); frame = 0; };
    const wait = () => { buffering = true; suspend(); };
    const play = () => { buffering = false; resume(); };
    const pause = () => { update(); suspend(); };
    const ended = () => {
      if (alignment && !signal?.aborted) set(offset + alignment.characters.join('').length, true);
      suspend();
    };
    const visibility = () => { if (document.hidden) suspend(); else resume(); };
    const events: Array<[string, () => void]> = [
      ['playing', play], ['seeked', play], ['timeupdate', resume], ['ratechange', resume],
      ['waiting', wait], ['stalled', wait], ['seeking', suspend], ['pause', pause],
      ['ended', ended], ['error', suspend],
    ];
    set(offset);
    events.forEach(([name, listener]) => audio.addEventListener(name, listener));
    document.addEventListener('visibilitychange', visibility);
    signal?.addEventListener('abort', suspend, { once: true });
    resume();
    return () => {
      suspend();
      events.forEach(([name, listener]) => audio.removeEventListener(name, listener));
      document.removeEventListener('visibilitychange', visibility);
      signal?.removeEventListener('abort', suspend);
    };
  }, [playback]);
  // React can batch `ended` with the controller clearing playback. Keep the
  // finished reply's position even if there was no intermediate render.
  if (!playback) return position?.completed && position.count === position.playback.text.length
    ? position.count : undefined;
  if (playback.signal?.aborted) return undefined;
  return position?.playback === playback ? position.count : playback.offset;
}
