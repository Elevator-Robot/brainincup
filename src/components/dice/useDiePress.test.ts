import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDiePress } from './useDiePress';

const point = { pointerId: 1, button: 0, clientX: 100, clientY: 100 };

describe('die asset activation', () => {
  it('requires a press and release on the asset and gives immediate feedback', () => {
    const activate = vi.fn();
    const feedback = vi.fn();
    const { result } = renderHook(() => useDiePress(true, activate, feedback));
    act(() => result.current.up(point));
    expect(activate).not.toHaveBeenCalled();
    act(() => result.current.down(point));
    expect(feedback).toHaveBeenLastCalledWith(true);
    act(() => result.current.up(point));
    expect(feedback).toHaveBeenLastCalledWith(false);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('cancels dragging, scrolling, pointer cancellation and outside releases', () => {
    const activate = vi.fn();
    const { result } = renderHook(() => useDiePress(true, activate, vi.fn()));
    act(() => { result.current.down(point); result.current.move({ ...point, clientY: 130 }); result.current.up(point); });
    for (const type of ['scroll', 'pointercancel', 'pointerup']) {
      act(() => { result.current.down(point); window.dispatchEvent(new Event(type)); result.current.up(point); });
    }
    expect(activate).not.toHaveBeenCalled();
  });

  it('supports keyboard activation but never activates disabled or non-primary presses', () => {
    const activate = vi.fn();
    const feedback = vi.fn();
    const { result, rerender } = renderHook(({ enabled }) => useDiePress(enabled, activate, feedback), { initialProps: { enabled: true } });
    act(() => { result.current.down({ ...point, button: 2 }); result.current.up(point); });
    expect(activate).not.toHaveBeenCalled();
    act(() => result.current.keyboard());
    expect(activate).toHaveBeenCalledTimes(1);
    act(() => result.current.down(point));
    rerender({ enabled: false });
    act(() => { result.current.up(point); result.current.keyboard(); });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenLastCalledWith(false);
  });
});
