import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MessageList from '../components/MessageList';
import type { Message } from '../components/MessageBubble';
import type { SpeechPlayback } from '../chat/speech';

class AudioClock extends EventTarget {
  currentTime = .2; paused = false; ended = false; seeking = false; readyState = 4; playbackRate = 1;
}
class NativeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) { this.ranges = ranges; }
}
const highlights = new Map<string, NativeHighlight>();
const frames = new Map<number, FrameRequestCallback>();
let id = 0;
const text = 'First sentence. Second sentence.';
const message: Message = { role: 'assistant', content: 'First **sentence**. Second sentence.' };
const timing = (value: string) => ({ characters: [...value], startTimes: [...value].map((_, i) => i * .1), endTimes: [...value].map((_, i) => (i + 1) * .1) });
const playback = (clock: AudioClock): SpeechPlayback => ({ message, audio: clock as unknown as HTMLAudioElement, text, offset: 0, alignment: timing(text) });
const highlighted = () => highlights.get('brain-speech')?.ranges[0].toString();
const tick = () => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(999999)); });
beforeEach(() => {
  highlights.clear(); frames.clear(); id = 0;
  vi.stubGlobal('CSS', { highlights }); vi.stubGlobal('Highlight', NativeHighlight);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('follows currentTime rather than animation time and preserves Markdown/text selection', () => {
  const clock = new AudioClock();
  const { container } = render(<MessageList messages={[message]} playback={playback(clock)} />);
  const strong = container.querySelector('strong');
  expect(highlighted()).toBe('First sentence.');
  for (let frame = 0; frame < 10; frame++) tick();
  expect(highlighted()).toBe('First sentence.');
  clock.currentTime = 2; tick();
  expect(highlighted()).toBe('Second sentence.');
  expect(container.querySelector('strong')).toBe(strong);
  const selection = window.getSelection()!;
  const range = document.createRange(); range.selectNodeContents(strong!);
  selection.removeAllRanges(); selection.addRange(range);
  clock.currentTime = .2; tick();
  expect(selection.toString()).toBe('sentence');
  selection.removeAllRanges();
});

it('clears on buffering/pause and resynchronizes after seeking or a playback-rate change', () => {
  const clock = new AudioClock();
  render(<MessageList messages={[message]} playback={playback(clock)} />);
  act(() => clock.dispatchEvent(new Event('waiting')));
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
  clock.currentTime = 2; clock.readyState = 2;
  act(() => clock.dispatchEvent(new Event('seeked')));
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
  clock.readyState = 4; act(() => clock.dispatchEvent(new Event('playing')));
  expect(highlighted()).toBe('Second sentence.');
  clock.paused = true; act(() => clock.dispatchEvent(new Event('pause')));
  expect(highlights.size).toBe(0);
  clock.paused = false; clock.currentTime = .3; clock.playbackRate = 2;
  act(() => clock.dispatchEvent(new Event('seeked')));
  expect(highlighted()).toBe('First sentence.');
  act(() => clock.dispatchEvent(new Event('ratechange'))); tick();
  expect(highlighted()).toBe('First sentence.');
});

it('uses each chunk’s offset and removes all highlighting at the end', () => {
  const clock = new AudioClock();
  const second = 'Second sentence.';
  const speech = { ...playback(clock), offset: text.indexOf(second), alignment: timing(second) };
  render(<MessageList messages={[message]} playback={speech} />);
  expect(highlighted()).toBe(second);
  clock.ended = true; act(() => clock.dispatchEvent(new Event('ended')));
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
});

it('targets the chosen reply even when two messages have identical content', () => {
  const clock = new AudioClock();
  const second = { ...message };
  const { container } = render(<MessageList messages={[message, second]} playback={{ ...playback(clock), message: second }} />);
  const range = highlights.get('brain-speech')!.ranges[0];
  expect(container.querySelectorAll('.cosmic-chat-prose')[1].contains(range.startContainer)).toBe(true);
});

it('keeps the full reply readable for voice and does not fake timing when metadata is absent', () => {
  const clock = new AudioClock();
  const arriving = { ...message, populateOnMount: true };
  const { container, rerender } = render(<MessageList messages={[arriving]} playback={{ ...playback(clock), message: arriving, alignment: null }} />);
  expect(container.querySelector('.cosmic-chat-prose')).toHaveTextContent(text);
  expect(highlights.size).toBe(0);
  rerender(<MessageList messages={[arriving]} />);
  expect(container.querySelector('.cosmic-chat-prose')).toHaveTextContent(text);
});

it('clears immediately on cancellation and never restarts from a stale audio event', () => {
  const clock = new AudioClock(); const controller = new AbortController();
  render(<MessageList messages={[message]} playback={{ ...playback(clock), signal: controller.signal }} />);
  expect(highlighted()).toBe('First sentence.');
  act(() => controller.abort());
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
  act(() => clock.dispatchEvent(new Event('playing')));
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
});

it('resynchronizes to the current audio position after returning from a hidden tab', () => {
  const clock = new AudioClock();
  render(<MessageList messages={[message]} playback={playback(clock)} />);
  const hidden = vi.spyOn(document, 'hidden', 'get');
  hidden.mockReturnValue(true); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(highlights.size).toBe(0); expect(frames.size).toBe(0);
  clock.currentTime = 2;
  hidden.mockReturnValue(false); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(highlighted()).toBe('Second sentence.');
});

it('uses a non-destructive paragraph cue when native highlights are unavailable', () => {
  vi.stubGlobal('CSS', {}); vi.stubGlobal('Highlight', undefined);
  const clock = new AudioClock();
  const { container } = render(<MessageList messages={[message]} playback={playback(clock)} />);
  const strong = container.querySelector('strong');
  expect(container.querySelector('p')).toHaveClass('cosmic-speech-current');
  clock.ended = true; act(() => clock.dispatchEvent(new Event('ended')));
  expect(container.querySelector('.cosmic-speech-current')).toBeNull();
  expect(container.querySelector('strong')).toBe(strong);
});
