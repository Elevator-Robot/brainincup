import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';

afterEach(cleanup);

it('adds an editable GM action without sending or erasing the existing draft', () => {
  const onSend = vi.fn();
  const draft = { current: 'I keep my lantern raised.' };
  render(<ChatComposer draft={draft} onSend={onSend} isGameMasterMode isLocked={false} isWaiting={false} isPrimed={false} placeholder="Your next action" />);
  fireEvent.click(screen.getByRole('button', { name: 'Look around' }));
  expect(screen.getByRole('textbox')).toHaveValue('I keep my lantern raised.\nI look around carefully. What catches my attention?');
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(onSend).not.toHaveBeenCalled();
});

it('locks shortcuts during unresolved gameplay and omits them in Brain mode', () => {
  const props = { draft: { current: '' }, onSend: vi.fn(), isLocked: true, isWaiting: false, isPrimed: false, placeholder: '' };
  const { rerender } = render(<ChatComposer {...props} isGameMasterMode />);
  expect(screen.getByRole('button', { name: 'Inventory' })).toBeDisabled();
  rerender(<ChatComposer {...props} />);
  expect(screen.queryByRole('group', { name: 'Adventure actions' })).not.toBeInTheDocument();
});
