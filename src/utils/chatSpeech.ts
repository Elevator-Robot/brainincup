/** Only public reply text goes to TTS, never reasoning/tool metadata. */
export { markdownSpeechText as spokenText } from './markdownSpeech';

export function speechChunks(text: string, limit = 900): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const word = window.lastIndexOf(' ');
    let end = sentence > limit / 2 ? sentence + 1 : word > limit / 2 ? word : limit;
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
