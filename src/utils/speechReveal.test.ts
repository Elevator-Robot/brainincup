import { expect, it } from 'vitest';
import { validSpeechAlignment } from '../../shared/chatSpeech';
import { createSpeechTimeline } from './speechReveal';

it('validates matching timing and rejects missing, mismatched, or non-monotonic data', () => {
  const timing = { characters: ['A', '🧠', '.'], startTimes: [0, .2, .6], endTimes: [.2, .6, .8] };
  expect(validSpeechAlignment(timing, 'A🧠.')).toEqual(timing);
  expect(validSpeechAlignment(timing, 'Different')).toBeNull();
  expect(validSpeechAlignment({ ...timing, startTimes: [0, -.1, .6] }, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment({ ...timing, endTimes: [.2, .1, .8] }, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment(null, 'A🧠.')).toBeNull();
  expect(validSpeechAlignment({ characters: ['A'], startTimes: [0], endTimes: [0] }, 'A')).toBeNull();
});

it('uses real character timestamps with UTF-16 offsets, silence, seeks, and completion', () => {
  const at = createSpeechTimeline({ characters: ['A', '🧠', '.'], startTimes: [.1, .2, .6], endTimes: [.2, .6, .8] });
  expect(at(0)).toBe(0);
  expect(at(.15)).toBe(1);
  expect(at(.3)).toBe(3);
  expect(at(.7)).toBe(4);
  expect(at(.15)).toBe(1);
  expect(at(1)).toBe(4);
});
