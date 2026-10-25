import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SiteBackground from './SiteBackground';

const frames = new Map<number, FrameRequestCallback>();
let sequence = 0;
const move = (pointerType = 'mouse', buttons = 0) => {
  const event = new Event('pointermove');
  Object.assign(event, { pointerType, buttons, clientX: innerWidth, clientY: innerHeight });
  window.dispatchEvent(event);
};
const settle = () => {
  let count = 0;
  while (frames.size && count < 400) {
    count++;
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(count * 16));
  }
  return count;
};
beforeEach(() => {
  frames.clear(); sequence = 0;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('pointer: fine'), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('preserves the shared nebula and keeps decorative depth out of the accessibility tree', () => {
  const { container } = render(<SiteBackground />);
  expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('img')).toHaveAttribute('src', '/images/workspace-nebula.svg');
  expect(container.querySelectorAll('.site-background-dust i')).toHaveLength(12);
  expect(container.querySelector('video, canvas')).toBeNull();
});
it('eases within a small bounded range, then stops requesting frames', () => {
  const { container } = render(<SiteBackground />);
  const background = container.firstElementChild as HTMLElement;
  move();
  expect(frames.size).toBe(1);
  const count = settle();
  expect(count).toBeLessThan(400);
  expect(frames.size).toBe(0);
  expect(background.style.getPropertyValue('--ambient-x')).toBe('14.00px');
  expect(background.style.getPropertyValue('--ambient-y')).toBe('10.00px');
  window.dispatchEvent(new Event('blur')); settle();
  expect(background.style.getPropertyValue('--ambient-x')).toBe('0.00px');
});
it('does not track touch, dragging, or reduced-motion pointers', () => {
  const first = render(<SiteBackground />);
  move('touch'); move('mouse', 1);
  expect(frames.size).toBe(0);
  first.unmount();
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  render(<SiteBackground />);
  move(); expect(frames.size).toBe(0);
});
it('cleans up motion when the page becomes hidden', () => {
  const { container } = render(<SiteBackground />);
  move(); settle();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(container.firstElementChild).toHaveAttribute('data-paused', 'true');
  expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--ambient-x')).toBe('');
  move(); expect(frames.size).toBe(0);
});
