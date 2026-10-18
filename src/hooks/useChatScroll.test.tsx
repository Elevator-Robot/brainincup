import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from './useChatScroll';

let height = 1000;
let resize: () => void;
const disconnect = vi.fn();

function Chat({ conversation = 'one', desktop = true }) {
  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll(conversation, desktop);
  return <><div ref={scrollRef} data-testid="scroll"><div ref={contentRef} /></div>
    {!isAtBottom && <button onClick={scrollToLatest}>Latest messages</button>}</>;
}

beforeEach(() => {
  vi.useFakeTimers();
  height = 1000;
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('chat scroll anchoring', () => {
  it('follows streaming growth but respects a reader scrolling through history', () => {
    render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    expect(scroll.scrollTop).toBe(1000);
    height = 1300;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(1300);
    scroll.scrollTop = 150;
    fireEvent.scroll(scroll);
    height = 1600;
    act(() => { resize(); vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(150);
    fireEvent.click(screen.getByRole('button', { name: 'Latest messages' }));
    expect(scroll.scrollTop).toBe(1600);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reconnects on conversation/layout changes and cleans up pending frames', () => {
    const { rerender, unmount } = render(<Chat />);
    const scroll = screen.getByTestId('scroll');
    scroll.scrollTop = 0;
    fireEvent.scroll(scroll);
    rerender(<Chat conversation="two" desktop={false} />);
    expect(scroll.scrollTop).toBe(1000);
    act(() => resize());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });
});
