import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from './useChatScroll';

let height = 1000;
let resize: () => void;
let reducedMotion = false;
const disconnect = vi.fn();

function Chat({ conversation = 'one', desktop = true }) {
  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll(conversation, desktop);
  return <><div ref={scrollRef} data-testid="scroll"><div ref={contentRef}><textarea aria-label="Nested control" /></div></div>
    {!isAtBottom && <button onClick={scrollToLatest}>Latest messages</button>}</>;
}

beforeEach(() => {
  vi.useFakeTimers();
  height = 1000;
  reducedMotion = false;
  const positions = new WeakMap<HTMLElement, number>();
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) {
    return Math.min(positions.get(this) ?? 0, Math.max(0, height - 300));
  });
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value: number) {
    positions.set(this, Math.max(0, Math.min(value, height - 300)));
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reducedMotion; }, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('chat scroll anchoring', () => {
  it('follows streaming growth but respects a reader scrolling through history', () => {
    render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    expect(scroll.scrollTop).toBe(700);
    height = 1300;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(1000);
    scroll.scrollTop = 150;
    fireEvent.scroll(scroll);
    height = 1600;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(150);
    fireEvent.click(screen.getByRole('button', { name: 'Latest messages' }));
    expect(scroll.scrollTop).toBe(1300);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reconnects on conversation/layout changes and cleans up pending frames', () => {
    const { rerender, unmount } = render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    rerender(<Chat conversation="two" desktop={false} />);
    expect(scroll.scrollTop).toBe(700);
    act(() => resize());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });

  it('releases on a small upward gesture before a pending streaming update can pull it back', () => {
    render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    act(() => resize());
    fireEvent.wheel(scroll, { deltaY: -1 });
    scroll.scrollTop = 699;
    fireEvent.scroll(scroll);
    height = 1200;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(699);
    expect(screen.getByRole('button', { name: 'Latest messages' })).toBeInTheDocument();
    fireEvent.wheel(scroll, { deltaY: 100 });
    scroll.scrollTop = 900;
    fireEvent.scroll(scroll);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    height = 1400;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(1100);
  });

  it('springs back at the bottom without changing scroll position or unpinning', () => {
    const { unmount } = render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    fireEvent.wheel(scroll, { deltaY: 160 });
    act(() => vi.advanceTimersByTime(16));
    expect(parseFloat(scroll.style.translate.split(' ')[1])).toBeLessThan(0);
    expect(scroll.scrollTop).toBe(700);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500));
    expect(scroll.style.translate).toBe('');
    fireEvent.wheel(scroll, { deltaY: 160 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(scroll.style.translate).toBe('');
  });

  it('supports touch pulls and keyboard scrolling while leaving nested inputs alone', () => {
    render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    fireEvent.wheel(screen.getByRole('textbox'), { deltaY: -100 });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    fireEvent.keyDown(scroll, { key: 'PageUp' });
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    fireEvent.touchStart(scroll, { touches: [{ clientX: 30, clientY: 50 }] });
    fireEvent.touchMove(scroll, { touches: [{ clientX: 30, clientY: 150 }] });
    act(() => vi.advanceTimersByTime(16));
    expect(parseFloat(scroll.style.translate.split(' ')[1])).toBeGreaterThan(0);
    expect(scroll.scrollTop).toBe(0);
    fireEvent.touchEnd(scroll);
    act(() => vi.advanceTimersByTime(1500));
    expect(scroll.style.translate).toBe('');
    expect(screen.getByRole('button', { name: 'Latest messages' })).toBeInTheDocument();
  });

  it('respects reduced motion and ignores pinch-zoom or horizontal gestures', () => {
    render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    fireEvent.wheel(scroll, { deltaY: -100, ctrlKey: true });
    fireEvent.wheel(scroll, { deltaY: -1, deltaX: 100 });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    reducedMotion = true;
    fireEvent.wheel(scroll, { deltaY: 160 });
    act(() => vi.advanceTimersByTime(100));
    expect(scroll.style.translate).toBe('');
    fireEvent.wheel(scroll, { deltaY: -10 });
    expect(screen.getByRole('button', { name: 'Latest messages' })).toBeInTheDocument();
  });
});
