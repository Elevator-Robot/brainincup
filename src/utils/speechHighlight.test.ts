import { expect, it } from 'vitest';
import { validSpeechAlignment } from '../../shared/chatSpeech';
import { createSpeechTimeline, sentenceAt, sentenceRange, speechSentences } from './speechHighlight';

it('validates real matching timing and rejects missing, mismatched, or non-monotonic data', () => {
  const timing = { characters: ['A', '🧠', '.'], startTimes: [0, .2, .6], endTimes: [.2, .6, .8] };
  expect(validSpeechAlignment(timing, 'A🧠.')).toEqual(timing);
  expect(validSpeechAlignment(timing, 'Different')).toBeNull();
  expect(validSpeechAlignment({ ...timing, startTimes: [0, -.1, .6] }, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment({ ...timing, endTimes: [.2, .1, .8] }, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment(null, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment({ characters: ['A'], startTimes: [0], endTimes: [0] }, 'A')).toBeNull();
});
it('uses character timestamps with UTF-16-safe offsets, silence, and seeks', () => {
  const at = createSpeechTimeline({ characters: ['A', '🧠', '.'], startTimes: [.1, .2, .6], endTimes: [.2, .6, .8] });
  expect(at(0)).toBeNull();
  expect(at(.3)).toBe(1);
  expect(at(.7)).toBe(3);
  expect(at(.15)).toBe(0); // A backward seek, not elapsed wall-clock time.
  expect(at(.8)).toBeNull();
  expect(at(1)).toBeNull();
});
it('locates the sentence containing the timed character', () => {
  const text = 'First sentence. Second sentence!';
  const segments = speechSentences(text);
  expect(sentenceAt(segments, 2)?.text).toBe('First sentence.');
  expect(sentenceAt(segments, 20)?.text).toBe('Second sentence!');
});
it('maps a sentence across Markdown elements without touching text selection or nodes', () => {
  const root = document.createElement('div');
  root.innerHTML = '<p>First <strong>sentence</strong>. Second sentence.</p>';
  const strong = root.querySelector('strong');
  const text = 'First sentence. Second sentence.';
  const range = sentenceRange(root, speechSentences(text)[0], text);
  expect(range?.toString()).toBe('First sentence.');
  expect(root.querySelector('strong')).toBe(strong);
});
it('distinguishes repeated sentences and skips omitted code rather than guessing a highlight', () => {
  const root = document.createElement('div');
  root.innerHTML = '<p>Again.</p><pre><code>privateExample()</code></pre><p>Again.</p>';
  const text = 'Again. Code block omitted. Again.';
  const sentences = speechSentences(text);
  expect(sentenceRange(root, sentences[1], text)).toBeNull();
  const range = sentenceRange(root, sentences[2], text)!;
  expect(root.lastElementChild?.contains(range.startContainer)).toBe(true);
});
