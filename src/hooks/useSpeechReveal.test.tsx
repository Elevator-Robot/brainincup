import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MessageList from '../components/MessageList';
import type { Message } from '../components/MessageBubble';
import type { SpeechPlayback } from '../chat/speech';
import { spokenText } from '../utils/chatSpeech';

class AudioClock extends EventTarget {
  currentTime = .21; paused = false; ended = false; seeking = false; readyState = 4; playbackRate = 1;
}
const frames = new Map<number, FrameRequestCallback>();
let id = 0;
const text = 'First sentence. Second sentence.';
const message: Message = { role: 'assistant', content: 'First **sentence**. Second sentence.' };
const timing = (value: string) => ({ characters: [...value], startTimes: [...value].map((_, i) => i * .1), endTimes: [...value].map((_, i) => (i + 1) * .1) });
const playback = (clock: AudioClock): SpeechPlayback => ({ message, audio: clock as unknown as HTMLAudioElement, text, offset: 0, alignment: timing(text) });
const tick = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(999999)); });
const prose = (container: HTMLElement) => container.querySelector('.cosmic-chat-prose')!;
beforeEach(() => {
  frames.clear(); id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('reveals individual characters from the media clock rather than exposing full sentences', () => {
  const clock = new AudioClock();
  const { container } = render(<MessageList messages={[message]} playback={playback(clock)} />);
  expect(prose(container).textContent).toBe('Fir');
  for (let frame = 0; frame < 10; frame++) tick();
  expect(prose(container).textContent).toBe('Fir');
  clock.currentTime = .31; tick();
  expect(prose(container).textContent).toBe('Firs');
  clock.currentTime = .81; tick();
  expect(prose(container).textContent).toBe('First sen');
  const strong = container.querySelector('strong');
  clock.currentTime = 1.01; tick();
  expect(prose(container).textContent).toBe('First sente');
  expect(container.querySelector('strong')).toBe(strong);
  expect(prose(container)).not.toHaveTextContent('Second');
  expect(prose(container)).toHaveAttribute('aria-busy', 'true');
});

it('freezes while paused/buffering and follows seeks and rate changes without a wall-clock estimate', () => {
  const clock = new AudioClock();
  const { container } = render(<MessageList messages={[message]} playback={playback(clock)} />);
  act(() => clock.dispatchEvent(new Event('waiting')));
  clock.currentTime = 2; tick();
  expect(prose(container).textContent).toBe('Fir');
  expect(frames.size).toBe(0);
  clock.readyState = 2; act(() => clock.dispatchEvent(new Event('seeked')));
  expect(prose(container).textContent).toBe(text.slice(0, 21));
  clock.paused = true; act(() => clock.dispatchEvent(new Event('pause')));
  clock.currentTime = 2.5; tick();
  expect(prose(container).textContent).toBe(text.slice(0, 21));
  clock.currentTime = .41; clock.readyState = 4; clock.playbackRate = 2;
  act(() => clock.dispatchEvent(new Event('seeked')));
  expect(prose(container).textContent).toBe('First');
  act(() => clock.dispatchEvent(new Event('ratechange'))); tick();
  expect(prose(container).textContent).toBe('First');
});

it('holds the current chunk boundary during synthesis and never dumps later chunks', () => {
  const clock = new AudioClock();
  const first = 'First sentence.';
  const { container, rerender } = render(<MessageList messages={[message]} playback={{ ...playback(clock), alignment: null }} />);
  expect(prose(container).textContent).toBe('');
  rerender(<MessageList messages={[message]} playback={{ ...playback(clock), alignment: timing(first) }} />);
  clock.ended = true; act(() => clock.dispatchEvent(new Event('ended')));
  expect(prose(container).textContent).toBe(first);
  rerender(<MessageList messages={[message]} playback={{ ...playback(clock), offset: first.length + 1, alignment: null }} />);
  expect(prose(container).textContent).toBe(first + ' ');
  clock.ended = false; clock.currentTime = .11;
  rerender(<MessageList messages={[message]} playback={{ ...playback(clock), offset: first.length + 1, alignment: timing('Second sentence.') }} />);
  expect(prose(container).textContent).toBe(first + ' Se');
  clock.currentTime = 10; act(() => clock.dispatchEvent(new Event('ended')));
  expect(prose(container).textContent).toBe(text);
  rerender(<MessageList messages={[message]} />);
  expect(prose(container).textContent).toBe(text);
});

it('targets one reply by stable ID and holds queued replies without hiding unrelated history', () => {
  const clock = new AudioClock();
  const chosen = { ...message, messageId: 'chosen' };
  const pending = { ...message, messageId: 'pending', populateOnMount: true };
  const { container } = render(<MessageList messages={[message, chosen, pending]}
    playback={{ ...playback(clock), message: { ...chosen } }} pendingSpeech={[{ ...pending }]} />);
  const blocks = container.querySelectorAll('.cosmic-chat-prose');
  expect(blocks[0].textContent).toBe(text);
  expect(blocks[1].textContent).toBe('Fir');
  expect(blocks[2].textContent).toBe('');
});

it('reveals headings, lists, links, entities, code and joined emoji through one shared text mapping', () => {
  const clock = new AudioClock();
  const content = '# First **light**\n\nA &amp; B. [Open](https://example.com).\n\n- One\n- Two\n\n```txt\nend()\n```\n\n👩‍🚀';
  const full = spokenText(content);
  const selected: Message = { role: 'assistant', content };
  const { container } = render(<MessageList messages={[selected]} playback={{
    message: selected, audio: clock as unknown as HTMLAudioElement, text: full, offset: 0, alignment: timing(full),
  }} />);
  clock.currentTime = .71; tick();
  expect(container.querySelector('h1')?.textContent).toBe('First li');
  expect(container.querySelector('a')).toBeNull();
  expect(container.querySelector('ul')).toBeNull();
  expect(container.querySelector('code')).toBeNull();
  clock.currentTime = full.indexOf('B') * .1 + .01; tick();
  expect(prose(container)).toHaveTextContent('A & B');
  expect(prose(container)).not.toHaveTextContent('&amp;');
  clock.currentTime = 100; tick();
  expect(container.querySelector('a')).toHaveTextContent('Open');
  expect(container.querySelectorAll('li')).toHaveLength(2);
  expect(container.querySelector('code')).toHaveTextContent('end()');
  expect(prose(container)).toHaveTextContent('👩‍🚀');
  expect(prose(container)).toHaveAttribute('aria-busy', 'false');
});

it('continues from the revealed prefix on stop and cancels stale media callbacks', () => {
  const clock = new AudioClock(); const controller = new AbortController();
  const { container, rerender } = render(<MessageList messages={[message]} playback={{ ...playback(clock), signal: controller.signal }} />);
  expect(prose(container).textContent).toBe('Fir');
  act(() => controller.abort());
  rerender(<MessageList messages={[message]} />);
  expect(prose(container).textContent).toBe('Fir');
  clock.currentTime = 10;
  act(() => clock.dispatchEvent(new Event('playing')));
  expect(prose(container).textContent).toBe('Fir');
});

it('resynchronizes after a hidden tab without running animation callbacks in the background', () => {
  const clock = new AudioClock();
  const { container } = render(<MessageList messages={[message]} playback={playback(clock)} />);
  const hidden = vi.spyOn(document, 'hidden', 'get');
  hidden.mockReturnValue(true); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(frames.size).toBe(0);
  clock.currentTime = 2;
  hidden.mockReturnValue(false); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(prose(container).textContent).toBe(text.slice(0, 21));
});

it('keeps finished text selectable and preserves its reveal across layout remounts', () => {
  const clock = new AudioClock();
  const selected = { ...message, populateOnMount: true };
  clock.currentTime = 1.31;
  const first = render(<MessageList messages={[selected]} playback={{ ...playback(clock), message: selected }} />);
  const strong = first.container.querySelector('strong')!;
  const range = document.createRange(); range.selectNodeContents(strong);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  clock.currentTime = 2.01; tick();
  expect(window.getSelection()!.toString()).toBe('sentence');
  const visible = prose(first.container).textContent;
  window.getSelection()!.removeAllRanges();
  first.unmount();
  const second = render(<MessageList messages={[selected]} />);
  expect(prose(second.container).textContent).toBe(visible);
});
