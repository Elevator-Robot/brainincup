import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatVoice } from './useChatVoice';
import type { Message } from '../components/MessageBubble';
import type { GeneratedSpeech } from '../api/chatVoice';

const generate = vi.hoisted(() => vi.fn());
vi.mock('../api/chatVoice', () => ({ generateChatSpeech: generate }));

class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  src = '';
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();
  play = vi.fn(async () => {});
  constructor() { super(); FakeAudio.instances.push(this); }
}
const reply = (content: string, overrides: Partial<Message> = {}): Message => ({ role: 'assistant', content, populateOnMount: true, ...overrides });

beforeEach(() => {
  FakeAudio.instances = [];
  generate.mockReset().mockResolvedValue({ blob: new Blob(['audio'], { type: 'audio/mpeg' }), alignment: null });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', Object.assign(class {}, { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('starts muted and never generates speech for arrivals while muted', () => {
  const { result, rerender } = renderHook(({ messages }) => useChatVoice('brain', messages), { initialProps: { messages: [] as Message[] } });
  rerender({ messages: [reply('Hello there.')] });
  expect(result.current.enabled).toBe(false);
  expect(generate).not.toHaveBeenCalled();
});

it('unmute reads only the latest completed reply, strips markdown, and mute stops playback', async () => {
  const { result } = renderHook(() => useChatVoice('brain', [reply('Older reply'), reply('Hello **friend**.')]));
  act(() => result.current.toggle());
  await waitFor(() => expect(result.current.status).toBe('playing'));
  expect(generate).toHaveBeenCalledExactlyOnceWith('Hello friend.', expect.any(AbortSignal));
  act(() => result.current.toggle());
  expect(result.current.enabled).toBe(false);
  expect(result.current.status).toBe('idle');
  expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice');
});

it('speaks completed streamed replies once and does not narrate reasoning or user text', async () => {
  const { result, rerender } = renderHook(({ messages }) => useChatVoice('gm', messages), { initialProps: { messages: [] as Message[] } });
  act(() => result.current.toggle());
  rerender({ messages: [{ role: 'user', content: 'My action' }, reply('A door', { isTyping: true, reasoning: 'Secret plan' })] });
  expect(generate).not.toHaveBeenCalled();
  rerender({ messages: [{ role: 'user', content: 'My action' }, reply('A door opens.', { messageId: 'r1', reasoning: 'Secret plan' })] });
  await waitFor(() => expect(result.current.status).toBe('playing'));
  rerender({ messages: [{ role: 'user', content: 'My action' }, reply('A door opens.', { messageId: 'r1', sensations: ['hidden'] })] });
  expect(generate).toHaveBeenCalledExactlyOnceWith('A door opens.', expect.any(AbortSignal));
});

it('does not autoplay hydrated history and stops when changing conversations', async () => {
  const { result, rerender } = renderHook(({ id, messages }) => useChatVoice(id, messages), { initialProps: { id: 'brain', messages: [] as Message[] } });
  act(() => result.current.toggle());
  rerender({ id: 'brain', messages: [reply('History', { populateOnMount: false })] });
  expect(generate).not.toHaveBeenCalled();
  act(() => result.current.listen('Read this reply'));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  rerender({ id: 'gm', messages: [reply('Different history', { populateOnMount: false })] });
  expect(result.current.status).toBe('idle');
  expect(generate).toHaveBeenCalledTimes(1);
});

it('ignores a late generation after mute and makes no subsequent chunk requests', async () => {
  let resolve!: (value: GeneratedSpeech) => void;
  generate.mockImplementationOnce(() => new Promise<GeneratedSpeech>(done => { resolve = done; }));
  const { result } = renderHook(() => useChatVoice('brain', []));
  act(() => result.current.toggle());
  act(() => result.current.listen('A'.repeat(1800)));
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
  act(() => result.current.toggle());
  await act(async () => { resolve({ blob: new Blob(['audio']), alignment: null }); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(generate).toHaveBeenCalledTimes(1);
});

it('Listen reads every chunk while muted without enabling narration of subsequent replies', async () => {
  const { result, rerender } = renderHook(({ messages }) => useChatVoice('brain', messages), { initialProps: { messages: [] as Message[] } });
  act(() => result.current.listen('A'.repeat(1800)));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  expect(result.current.enabled).toBe(false);
  rerender({ messages: [reply('A new silent reply.', { messageId: 'new' })] });
  expect(generate).toHaveBeenCalledTimes(1);
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('ended')); });
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  expect(result.current.enabled).toBe(false);
  await waitFor(() => expect(result.current.status).toBe('playing'));
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('ended')); });
  await waitFor(() => expect(result.current.status).toBe('idle'));
  expect(result.current.enabled).toBe(false);
  rerender({ messages: [reply('A new silent reply.', { messageId: 'new' }), reply('Another silent reply.', { messageId: 'newer' })] });
  expect(generate).toHaveBeenCalledTimes(2);
});

it('Listen also preserves an explicitly unmuted preference after playback', async () => {
  const { result } = renderHook(() => useChatVoice('brain', []));
  act(() => result.current.toggle());
  act(() => result.current.listen('A chosen reply.'));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('ended')); });
  await waitFor(() => expect(result.current.status).toBe('idle'));
  expect(result.current.enabled).toBe(true);
});

it('binds timing to the exact chosen message and clears it when stopped', async () => {
  const selected = reply('Hi', { messageId: 'selected' });
  const alignment = { characters: ['H', 'i'], startTimes: [0, .1], endTimes: [.1, .2] };
  generate.mockResolvedValueOnce({ blob: new Blob(['audio']), alignment });
  const { result } = renderHook(() => useChatVoice('brain', [selected]));
  act(() => result.current.listen(selected.content, selected));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  expect(result.current.playback).toMatchObject({ message: selected, text: 'Hi', offset: 0, alignment });
  expect(result.current.enabled).toBe(false);
  act(() => result.current.stop());
  expect(result.current.playback).toBeNull();
});

it('mirrors actual pause and buffering events without changing the automatic mute preference', async () => {
  const { result } = renderHook(() => useChatVoice('brain', []));
  act(() => result.current.listen('A chosen reply.'));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('pause')); });
  expect(result.current.status).toBe('paused'); expect(result.current.enabled).toBe(false);
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('waiting')); });
  expect(result.current.status).toBe('loading');
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('playing')); });
  expect(result.current.status).toBe('playing'); expect(result.current.enabled).toBe(false);
});

it('surfaces provider failures, returns to muted, and does not interrupt text chat', async () => {
  generate.mockRejectedValueOnce(new Error('Voice unavailable'));
  const { result } = renderHook(() => useChatVoice('brain', []));
  act(() => result.current.listen('Hello'));
  await waitFor(() => expect(result.current.error).toBe('Voice unavailable'));
  expect(result.current.enabled).toBe(false);
  expect(result.current.status).toBe('idle');
});

it('queues replies in order and does not replay duplicate subscription arrivals', async () => {
  const { result, rerender } = renderHook(({ messages }) => useChatVoice('brain', messages), { initialProps: { messages: [] as Message[] } });
  act(() => result.current.toggle());
  rerender({ messages: [reply('First reply', { messageId: 'one' })] });
  await waitFor(() => expect(result.current.status).toBe('playing'));
  rerender({ messages: [reply('First reply', { messageId: 'one' }), reply('Second reply', { messageId: 'two' }), reply('Second reply', { messageId: 'two' })] });
  expect(generate).toHaveBeenCalledTimes(1);
  act(() => { FakeAudio.instances[0].dispatchEvent(new Event('ended')); });
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  expect(generate.mock.calls.map(call => call[0])).toEqual(['First reply', 'Second reply']);
});

it('clearing playback discards queued replies without replaying them', async () => {
  const { result, rerender } = renderHook(({ messages }) => useChatVoice('brain', messages), { initialProps: { messages: [] as Message[] } });
  act(() => result.current.toggle());
  rerender({ messages: [reply('First reply', { messageId: 'one' }), reply('Queued reply', { messageId: 'two' })] });
  await waitFor(() => expect(result.current.status).toBe('playing'));
  act(() => result.current.stop());
  await act(async () => {});
  expect(result.current.status).toBe('idle');
  expect(generate).toHaveBeenCalledTimes(1);
});
