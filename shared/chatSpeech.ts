/** Public transport contract. Contains timing for spoken prose only. */
export interface SpeechAlignment {
  characters: string[];
  startTimes: number[];
  endTimes: number[];
}
export interface SpeechPacket {
  audio: string;
  contentType: 'audio/mpeg';
  alignment: SpeechAlignment | null;
}

/** Never invent timing if a provider returns normalized/mismatched text. Audio
 * can still play without highlighting when alignment is absent or invalid. */
export function validSpeechAlignment(value: unknown, text: string): SpeechAlignment | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SpeechAlignment>;
  const { characters, startTimes, endTimes } = candidate;
  if (!Array.isArray(characters) || !Array.isArray(startTimes) || !Array.isArray(endTimes)
    || !characters.length || characters.length > 4000 || characters.length !== startTimes.length || characters.length !== endTimes.length
    || characters.some(character => typeof character !== 'string') || characters.join('') !== text) return null;
  let previous = 0, previousEnd = 0;
  for (let index = 0; index < startTimes.length; index++) {
    const start = startTimes[index], end = endTimes[index];
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)
      || start < previous || end < previousEnd || end < start || end > 1800) return null;
    previous = start; previousEnd = end;
  }
  if (previousEnd === 0) return null;
  return { characters, startTimes, endTimes };
}
