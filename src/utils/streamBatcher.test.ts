import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamBatcher } from './streamBatcher';

afterEach(() => vi.useRealTimers());

describe('stream batching', () => {
  it('batches token bursts and flushes text before the end event', () => {
    vi.useFakeTimers();
    const receive = vi.fn();
    const batch = createStreamBatcher(receive);
    batch.push({ type: 'TEXT_MESSAGE_START', messageId: 'one' });
    for (const delta of ['A ', 'violet ', 'sky.']) batch.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'one', delta });
    expect(receive).toHaveBeenCalledTimes(1);
    batch.push({ type: 'TEXT_MESSAGE_END', messageId: 'one' });
    expect(receive.mock.calls.map(([event]) => event)).toEqual([
      { type: 'TEXT_MESSAGE_START', messageId: 'one' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'one', delta: 'A violet sky.' },
      { type: 'TEXT_MESSAGE_END', messageId: 'one' },
    ]);
    vi.runAllTimers();
    expect(receive).toHaveBeenCalledTimes(3);
  });

  it('bounds latency and preserves separate message/tool deltas', () => {
    vi.useFakeTimers();
    const receive = vi.fn();
    const batch = createStreamBatcher(receive);
    batch.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'one', delta: 'first' });
    vi.advanceTimersByTime(32);
    expect(receive).toHaveBeenCalledTimes(1);
    const events = [
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'one', delta: 'next' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'two', delta: 'second' },
      { type: 'REASONING_MESSAGE_CONTENT', messageId: 'two', delta: 'reasoning' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'a', delta: '{' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'b', delta: '}' },
    ];
    events.forEach(batch.push);
    batch.flush();
    expect(receive.mock.calls.slice(1).map(([event]) => event)).toEqual(events);
    expect(vi.getTimerCount()).toBe(0);
  });
});
