import type { SpeechAlignment } from '../../shared/chatSpeech';

export interface SpeechSentence { start: number; end: number; text: string }
export function speechSentences(text: string): SpeechSentence[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale: undefined, options: { granularity: 'sentence' }) => { segment(value: string): Iterable<{ segment: string; index: number }> } }).Segmenter;
  const parts = Segmenter ? [...new Segmenter(undefined, { granularity: 'sentence' }).segment(text)]
    : [...text.matchAll(/[^.!?。！？]+(?:[.!?。！？]+["'”’)]*|$)/g)].map(match => ({ segment: match[0], index: match.index ?? 0 }));
  return parts.flatMap(part => {
    const trimmed = part.segment.trim();
    if (!trimmed) return [];
    const start = part.index + part.segment.indexOf(trimmed);
    return [{ start, end: start + trimmed.length, text: trimmed }];
  });
}

export function createSpeechTimeline(alignment: SpeechAlignment) {
  let length = 0;
  const offsets = alignment.characters.map(character => { const offset = length; length += character.length; return offset; });
  return (seconds: number): number | null => {
    if (!Number.isFinite(seconds) || seconds < 0 || !offsets.length || seconds >= alignment.endTimes.at(-1)!) return null;
    let low = 0, high = alignment.startTimes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (alignment.startTimes[middle] <= seconds) low = middle + 1;
      else high = middle;
    }
    return low ? offsets[low - 1] : null;
  };
}

export function sentenceAt(sentences: SpeechSentence[], character: number): SpeechSentence | undefined {
  let current: SpeechSentence | undefined;
  for (const sentence of sentences) {
    if (sentence.start > character) break;
    current = sentence;
  }
  return current;
}
const canonical = (value: string) => value.replace(/[‘’]/g, '\'').replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** Build a DOM Range across Markdown nodes without rewriting/wrapping text or
 * touching the user's actual Selection. Only public prose is searched. */
export function sentenceRange(root: HTMLElement, sentence: SpeechSentence, fullText: string): Range | null {
  const characters: string[] = [];
  const positions: Array<{ node: Text; offset: number } | null> = [];
  const space = () => { if (characters.length && characters.at(-1) !== ' ') { characters.push(' '); positions.push(null); } };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element && (node.matches('pre, [aria-hidden="true"], [data-ui-placeholder]')
        || (node.tagName === 'A' && /^https?:\/\/\S+$/.test(node.textContent || '')))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node instanceof Element) {
      if (node.matches('p, li, h1, h2, h3, h4, blockquote, br, td, th, tr')) space();
      continue;
    }
    const text = node as Text;
    for (let offset = 0; offset < text.data.length; offset++) {
      const value = text.data[offset];
      if (/\s/.test(value)) { space(); continue; }
      characters.push(value.replace(/[‘’]/g, '\'').replace(/[“”]/g, '"'));
      positions.push({ node: text, offset });
    }
  }
  const prose = characters.join('');
  const target = canonical(sentence.text);
  if (!target) return null;
  // Repeated identical sentences must not always highlight the first one.
  const prefix = canonical(fullText.slice(0, sentence.start));
  let occurrence = 0, search = 0;
  while ((search = prefix.indexOf(target, search)) !== -1) { occurrence++; search += target.length; }
  let start = -1;
  for (let index = 0; index <= occurrence; index++) {
    start = prose.indexOf(target, start + 1);
    if (start < 0) return null;
  }
  const first = positions[start], last = positions[start + target.length - 1];
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, first.offset); range.setEnd(last.node, last.offset + 1);
  return range;
}
