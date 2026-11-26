import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWorkspaceViewport } from './useWorkspaceViewport';

function Workspace() {
  const ref = useWorkspaceViewport();
  return <div ref={ref} data-testid="workspace"><textarea aria-label="Message" /></div>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('fits a mobile keyboard without treating pinch zoom as a resize and cleans up listeners', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
  vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 844);
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  const { unmount } = render(<Workspace />);
  const workspace = screen.getByTestId('workspace');
  const resize = (height: number, top = 0, scale = 1) => {
    act(() => {
      Object.assign(viewport, { height, offsetTop: top, scale });
      viewport.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(16);
    });
  };
  screen.getByRole('textbox').focus();
  resize(420, 12);
  expect(workspace.style.getPropertyValue('--workspace-viewport-height')).toBe('420px');
  expect(workspace.style.getPropertyValue('--workspace-viewport-top')).toBe('12px');
  expect(workspace).toHaveAttribute('data-keyboard-open', 'true');
  resize(210, 40, 2);
  expect(workspace.style.getPropertyValue('--workspace-viewport-height')).toBe('420px');
  resize(844);
  expect(workspace).toHaveAttribute('data-keyboard-open', 'false');
  // Android can resize both viewports, rather than only the visual viewport.
  vi.stubGlobal('innerHeight', 400);
  resize(400);
  expect(workspace).toHaveAttribute('data-keyboard-open', 'true');
  fireEvent(window, new Event('resize'));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  resize(844);
  expect(vi.getTimerCount()).toBe(0);
});
