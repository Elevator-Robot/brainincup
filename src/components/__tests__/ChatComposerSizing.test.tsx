import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';

let available = 640;
beforeEach(() => {
  available = 640;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function(this: HTMLElement) {
    return this.tagName === 'FORM' ? available : 200;
  });
  vi.spyOn(HTMLSpanElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLSpanElement) {
    const width = Math.max(...(this.textContent || '').split('\n').map(line => line.length * 8));
    return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON() {} };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const draft = { current: '' };
  const { container } = render(<ChatComposer draft={draft} onSend={vi.fn()} isLocked={false} isWaiting={false} isPrimed={false} placeholder="Message Brain" />);
  const input = screen.getByRole('textbox');
  const width = () => Number.parseFloat((container.querySelector('.retro-input-shell') as HTMLElement).style.getPropertyValue('--composer-width'));
  return { draft, input, width };
}

it('grows for the draft, caps at available width, and returns to its compact size', () => {
  const { input, width } = setup();
  const initial = width();
  fireEvent.change(input, { target: { value: 'W'.repeat(60) } });
  expect(width()).toBeGreaterThan(initial);
  fireEvent.change(input, { target: { value: 'W'.repeat(400) } });
  expect(width()).toBe(available);
  fireEvent.change(input, { target: { value: '' } });
  expect(width()).toBe(initial);
});

it('sizes multiline text by its widest line and preserves the draft on viewport resize', () => {
  const { input, width, draft } = setup();
  const line = 'W'.repeat(60);
  fireEvent.change(input, { target: { value: line } });
  const singleLineWidth = width();
  fireEvent.change(input, { target: { value: `${line}\n${line}` } });
  expect(width()).toBe(singleLineWidth);
  available = 280;
  fireEvent.resize(window);
  expect(width()).toBe(280);
  expect(input).toHaveValue(`${line}\n${line}`);
  expect(draft.current).toBe(`${line}\n${line}`);
});
