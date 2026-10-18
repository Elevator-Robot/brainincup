import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDicePreviewRolls } from './useDicePreviewRolls';
import { DICE_ROLL_DURATION_MS, rollDie } from '../utils/diceRolls';

vi.mock('../utils/diceRolls', async original => ({ ...await original<typeof import('../utils/diceRolls')>(), rollDie: vi.fn(() => 3) }));
beforeEach(() => { vi.useFakeTimers(); vi.mocked(rollDie).mockReset().mockReturnValue(3); });
afterEach(() => vi.useRealTimers());

describe('independent preview dice', () => {
  it('only starts the clicked die and leaves every other die blank', () => {
    const { result } = renderHook(() => useDicePreviewRolls(false));
    act(() => { result.current.roll('d4'); result.current.roll('d4'); });
    expect(rollDie).toHaveBeenCalledExactlyOnceWith(4);
    expect(Object.keys(result.current.rolls)).toEqual(['d4']);
    expect(result.current.rollingCount).toBe(1);
    expect(result.current.dice.filter(die => die.id !== 'd4').every(die => die.value === undefined)).toBe(true);
    act(() => vi.advanceTimersByTime(DICE_ROLL_DURATION_MS));
    expect(result.current.rolls.d4).toMatchObject({ value: 3, isRolling: false });
    expect(result.current.dice.filter(die => die.id !== 'd4').every(die => die.value === undefined)).toBe(true);
  });

  it('allows a second die to roll without restarting the first die clock', () => {
    const { result } = renderHook(() => useDicePreviewRolls(false));
    act(() => result.current.roll('d4'));
    const firstStart = result.current.rolls.d4.rollNonce;
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.roll('d6'));
    expect(result.current.rollingCount).toBe(2);
    expect(result.current.rolls.d4.rollNonce).toBe(firstStart);
    act(() => vi.advanceTimersByTime(DICE_ROLL_DURATION_MS - 1000));
    expect(result.current.rolls.d4.isRolling).toBe(false);
    expect(result.current.rolls.d6.isRolling).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.rollingCount).toBe(0);
    expect(Object.keys(result.current.rolls)).toEqual(['d4', 'd6']);
  });

  it('keeps percentile halves separate and supports reduced motion', () => {
    vi.mocked(rollDie).mockReturnValue(10);
    const { result } = renderHook(() => useDicePreviewRolls(true));
    act(() => result.current.roll('d100-tens'));
    expect(result.current.dice.find(die => die.id === 'd100-tens')?.value).toBe('00');
    expect(result.current.dice.find(die => die.id === 'd100-units')?.value).toBeUndefined();
    act(() => result.current.roll('d100-units'));
    expect(result.current.dice.find(die => die.id === 'd100-units')?.value).toBe('0');
    expect(result.current.rollingCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels active clocks on unmount', () => {
    const { result, unmount } = renderHook(() => useDicePreviewRolls(false));
    act(() => result.current.roll('d20'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
