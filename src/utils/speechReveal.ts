import type { SpeechAlignment } from '../../shared/chatSpeech';

/** Number of UTF-16 characters whose spoken timestamps have begun. */
export function createSpeechTimeline(alignment: SpeechAlignment) {
  let length = 0;
  const ends = alignment.characters.map(character => (length += character.length));
  return (seconds: number): number => {
    if (!Number.isFinite(seconds) || seconds < 0) return 0;
    let low = 0, high = alignment.startTimes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (alignment.startTimes[middle] <= seconds) low = middle + 1;
      else high = middle;
    }
    return low ? ends[low - 1] : 0;
  };
}
