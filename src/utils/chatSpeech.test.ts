import { expect, it } from 'vitest';
import { speechChunks, spokenText } from './chatSpeech';

it('narrates prose without reading formatting, URLs, or code blocks', () => {
  expect(spokenText('# Hello **friend**\n[Open the door](https://example.com).\n```js\nsecret()\n```'))
    .toBe('Hello friend Open the door. Code block omitted.');
});
it('chunks long replies without losing words or exceeding the backend limit', () => {
  const text = Array.from({ length: 400 }, (_, index) => `word${index}`).join(' ');
  const chunks = speechChunks(text);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(chunk => chunk.length <= 900)).toBe(true);
  expect(chunks.join(' ')).toBe(text);
});
it('handles unbroken strings and surrogate pairs', () => {
  const chunks = speechChunks('🧠'.repeat(1000));
  expect(chunks.join('')).toBe('🧠'.repeat(1000));
  expect(chunks.every(chunk => chunk.length <= 900 && !/[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
});
