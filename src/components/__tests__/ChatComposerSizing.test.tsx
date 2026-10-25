import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';
import { BRAIN_CHAT } from '../../chat/experienceAdapters';

let contentHeight = 44;
beforeEach(() => {
  contentHeight = 44;
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const draft = { current: '' };
  const { container } = render(<ChatComposer draft={draft} configuration={BRAIN_CHAT} onSend={vi.fn()} isLocked={false} isWaiting={false} isPrimed={false} placeholder="Message Brain" />);
  return { draft, input: screen.getByRole('textbox'), shell: container.querySelector('.retro-input-shell') as HTMLElement, container };
}

it('keeps width under CSS control and grows only vertically for a long draft', () => {
  const { input, shell, container } = setup();
  expect(input.style.height).toBe('44px');
  contentHeight = 120;
  fireEvent.change(input, { target: { value: 'A longer thought.\n'.repeat(5) } });
  expect(input.style.height).toBe('120px');
  expect(shell.style.width).toBe('');
  expect(shell.style.getPropertyValue('--composer-width')).toBe('');
  expect(container.querySelector('.cosmic-composer-measure')).toBeNull();
  contentHeight = 300;
  fireEvent.change(input, { target: { value: 'A longer thought.\n'.repeat(20) } });
  expect(input.style.height).toBe('144px');
  contentHeight = 44;
  fireEvent.change(input, { target: { value: '' } });
  expect(input.style.height).toBe('44px');
});

it('rewraps on viewport resize without changing or losing the draft', () => {
  const { input, draft } = setup();
  const text = 'A thought that wraps differently on a smaller screen.';
  fireEvent.change(input, { target: { value: text } });
  contentHeight = 88;
  fireEvent.resize(window);
  expect(input.style.height).toBe('88px');
  expect(input).toHaveValue(text);
  expect(draft.current).toBe(text);
});
