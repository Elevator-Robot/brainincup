import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../components/MessageBubble';
import { DICE_ROLL_DURATION_MS, rollD20, type DiceRollRequest } from '../utils/diceRolls';
import { useChatDiceRolls } from './useChatDiceRolls';

vi.mock('../utils/diceRolls', async importOriginal => ({
  ...await importOriginal<typeof import('../utils/diceRolls')>(), rollD20: vi.fn(() => 14),
}));

const request: DiceRollRequest = { requestId: 'check-1', statName: 'dexterity', statValue: 16, difficultyClass: 15 };
let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  vi.mocked(rollD20).mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function mountRolls(onSubmit = vi.fn().mockResolvedValue(undefined), initialMessages: Message[] = []) {
  return { onSubmit, ...renderHook(({ busy, conversationId }) => {
    const [messages, setMessages] = useState(initialMessages);
    const controls = useChatDiceRolls({ conversationId, busy, messages, setMessages, onSubmit });
    return { messages, ...controls };
  }, { initialProps: { busy: false, conversationId: 'adventure-1' } }) };
}

describe('requested chat dice checks', () => {
  it('deduplicates stream and subscription requests without rolling automatically', () => {
    const { result, onSubmit } = mountRolls();
    act(() => result.current.requestRoll(request));
    act(() => result.current.requestRoll(JSON.stringify(request)));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].diceRoll?.phase).toBe('pending');
    expect(result.current.hasPendingRoll).toBe(true);
    expect(rollD20).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('waits for narration and prevents duplicate clicks or rerolling a completed check', async () => {
    const { result, rerender, onSubmit } = mountRolls();
    rerender({ busy: true, conversationId: 'adventure-1' });
    act(() => result.current.requestRoll(request));
    expect(result.current.messages).toHaveLength(0);
    rerender({ busy: false, conversationId: 'adventure-1' });
    expect(result.current.messages).toHaveLength(1);
    act(() => { void result.current.roll(request.requestId); void result.current.roll(request.requestId); });
    expect(result.current.messages[0].diceRoll).toMatchObject({ phase: 'rolling', value: 14 });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(request), 14);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(result.current.messages[0].diceRoll?.phase).toBe('rolling');
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS - 1600); });
    expect(result.current.messages[0].diceRoll?.phase).toBe('submitted');
    expect(result.current.hasPendingRoll).toBe(false);
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(rollD20).toHaveBeenCalledTimes(1);
  });

  it('retries failed submissions with the original number, not a new roll', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
    const { result } = mountRolls(onSubmit);
    act(() => result.current.requestRoll(request));
    act(() => { void result.current.roll(request.requestId); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS); });
    expect(result.current.messages[0].diceRoll).toMatchObject({ phase: 'error', value: 14 });
    await act(async () => { await result.current.roll(request.requestId); });
    expect(result.current.messages[0].diceRoll).toMatchObject({ phase: 'submitted', value: 14 });
    expect(onSubmit.mock.calls.map(call => call[1])).toEqual([14, 14]);
    expect(rollD20).toHaveBeenCalledTimes(1);
  });

  it('rejects unsolicited, expired, replaced, or other-conversation checks', async () => {
    const { result, onSubmit } = mountRolls();
    act(() => {
      result.current.requestRoll(null);
      result.current.requestRoll({});
      result.current.requestRoll(request, 'another-adventure');
      result.current.requestRoll({ ...request, expiresAt: new Date(Date.now() - 1).toISOString() });
    });
    expect(result.current.messages).toHaveLength(0);
    await act(async () => { await result.current.roll(request.requestId); });
    act(() => result.current.requestRoll(request));
    act(() => result.current.requestRoll({ ...request, requestId: 'replacement-check' }));
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables a check when its request expires', async () => {
    const { result, onSubmit } = mountRolls();
    act(() => result.current.requestRoll({ ...request, expiresAt: new Date(Date.now() + 1000).toISOString() }));
    expect(result.current.hasPendingRoll).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.hasPendingRoll).toBe(false);
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes a server-cancelled check and ignores late duplicate stream events', async () => {
    const { result, onSubmit } = mountRolls();
    act(() => result.current.requestRoll(request));
    act(() => result.current.syncRequestedRoll(null, 'adventure-1'));
    expect(result.current.hasPendingRoll).toBe(true);
    act(() => result.current.syncRequestedRoll(request, 'adventure-1'));
    act(() => result.current.syncRequestedRoll(null, 'adventure-1'));
    act(() => result.current.requestRoll(request));
    expect(result.current.activeRequestId).toBeNull();
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves a selected number after refresh, requiring a fresh active request', async () => {
    const cached: Message[] = [{ role: 'assistant', content: '', diceRoll: { ...request, phase: 'rolling', value: 8 } }];
    const { result, onSubmit } = mountRolls(undefined, cached);
    expect(result.current.messages[0].diceRoll).toMatchObject({ phase: 'error', value: 8 });
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).not.toHaveBeenCalled();
    act(() => result.current.requestRoll(request));
    await act(async () => { await result.current.roll(request.requestId); });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(request), 8);
    expect(rollD20).not.toHaveBeenCalled();
  });

  it('keeps the turn locked until the reveal even when the server resolves early', async () => {
    const { result } = mountRolls();
    act(() => result.current.syncRequestedRoll(request, 'adventure-1'));
    act(() => { void result.current.roll(request.requestId); });
    act(() => result.current.syncRequestedRoll(null, 'adventure-1'));
    expect(result.current.activeRequestId).toBeNull();
    expect(result.current.hasPendingRoll).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(DICE_ROLL_DURATION_MS); });
    expect(result.current.hasPendingRoll).toBe(false);
  });

  it('skips animation for reduced motion and cancels timers on unmount', async () => {
    reducedMotion = true;
    const { result, unmount } = mountRolls();
    act(() => result.current.requestRoll(request));
    await act(async () => { await result.current.roll(request.requestId); });
    expect(result.current.messages[0].diceRoll).toMatchObject({ phase: 'submitted', duration: 0 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
