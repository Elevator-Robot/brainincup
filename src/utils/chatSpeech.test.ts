import { expect, it } from 'vitest';
import { speechChunks, spokenText } from './chatSpeech';

it('narrates every visible text block without reading Markdown or link destinations', () => {
  expect(spokenText('# Hello **friend**\n[Open the door](https://example.com).\n```js\nsecret()\n```'))
    .toBe('Hello friend Open the door. secret()');
  expect(spokenText('A &amp; B.\n\n> **Wait.**\n\n- First\n- Second\n\n`a_b`'))
    .toBe('A & B. Wait. First Second a_b');
  expect(spokenText('| Key | Value |\n| --- | --- |\n| A | B |\n\n![A star][sky]\n\n[sky]: /sky.png'))
    .toBe('Key Value A B A star');
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
