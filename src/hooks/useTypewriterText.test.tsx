import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTypewriterText } from './useTypewriterText';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('typewriter presentation', () => {
  it('paces a completed response instead of showing the whole batch', () => {
    const text = 'The stars shimmer above the quiet observatory.';
    const { result } = renderHook(() => useTypewriterText(text, true));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.length).toBeGreaterThan(0);
    expect(result.current.length).toBeLessThan(text.length);
    expect(text.startsWith(result.current)).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(text);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('queues streamed chunks without restarting or dumping the remaining text', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriterText(text, true), { initialProps: { text: 'The stars' } });
    act(() => vi.advanceTimersByTime(48));
    const prefix = result.current;
    rerender({ text: 'The stars shimmer above the observatory.' });
    expect(result.current).toBe(prefix);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('The stars shimmer above the observatory.');
  });

  it('does not replay history and honors reduced motion', () => {
    const history = renderHook(() => useTypewriterText('Already read.', false));
    expect(history.result.current).toBe('Already read.');
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const reduced = renderHook(() => useTypewriterText('New response.', true));
    expect(reduced.result.current).toBe('New response.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reveals joined emoji as one character and handles a split grapheme across chunks', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriterText(text, true), { initialProps: { text: '👩' } });
    act(() => vi.advanceTimersByTime(32));
    expect(result.current).toBe('👩');
    rerender({ text: '👩‍🚀 explores.' });
    expect(result.current).toBe('👩‍🚀');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('👩‍🚀 explores.');
  });

  it('reconciles authoritative replacements rather than appending stale text', () => {
    const { result, rerender } = renderHook(({ text }) => useTypewriterText(text, true), { initialProps: { text: 'An unfinished draft' } });
    act(() => vi.advanceTimersByTime(48));
    rerender({ text: 'Corrected response.' });
    expect(result.current).toBe('Corrected response.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs under StrictMode and cancels animation when unmounted', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useTypewriterText('A long response keeps arriving.', true), { wrapper });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.length).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
