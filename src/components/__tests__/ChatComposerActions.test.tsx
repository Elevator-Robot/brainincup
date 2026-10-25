import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';

const defaults = {
  onSend: vi.fn().mockResolvedValue(true),
  isLocked: false,
  isWaiting: false,
  isPrimed: false,
  isGameMasterMode: true,
  placeholder: 'Your next action',
};

const renderComposer = (draftText = '') => {
  const draft = { current: draftText };
  const utils = render(<ChatComposer {...defaults} draft={draft} />);
  return { ...utils, draft, input: screen.getByRole('textbox') };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('predictive composer', () => {
  it('shows a ghost tail that Tab accepts without sending', () => {
    const { input } = renderComposer('I look');
    expect(screen.getByText('around carefully.')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('I look around carefully.');
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('hides the ghost once the caret leaves the end of the draft', () => {
    const { input } = renderComposer('I look');
    fireEvent.select(input, { target: { selectionStart: 2, selectionEnd: 2 } });
    expect(screen.queryByText('around carefully.')).not.toBeInTheDocument();
  });

  it('stays dormant while the composer is locked', () => {
    const draft = { current: 'I look' };
    render(<ChatComposer {...defaults} isLocked draft={draft} />);
    expect(screen.queryByText('around carefully.')).not.toBeInTheDocument();
  });
});

describe('slash palette', () => {
  it('filters by the typed fragment and stages the highlighted action', () => {
    const { input, draft } = renderComposer();
    fireEvent.change(input, { target: { value: '/' } });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    fireEvent.change(input, { target: { value: '/ro' } });
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      '/lookLook aroundSurvey the scene',
      '/rollRollTest your luck',
    ]);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('/roll');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(draft.current).toBe('I attempt something risky and roll for it.');
    expect(input).toHaveValue('I attempt something risky and roll for it.');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('dismisses with Escape without touching the draft', () => {
    const { input } = renderComposer();
    fireEvent.change(input, { target: { value: '/lo' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(input).toHaveValue('/lo');
  });

  it('stays closed while locked, even for a bare slash', () => {
    const draft = { current: '/' };
    render(<ChatComposer {...defaults} isLocked draft={draft} />);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('action wheel', () => {
  it('opens from the discoverable Actions button without overwriting or sending the draft', () => {
    const { draft, input } = renderComposer('I pause to listen.');
    const button = screen.getByRole('button', { name: 'Browse chat actions' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Adventure actions' })).toBeInTheDocument();
    expect(draft.current).toBe('I pause to listen.');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('opens on right-click and appends the chosen action to the draft', () => {
    const { draft, input } = renderComposer('I keep my lantern raised.');
    fireEvent.contextMenu(input.closest('[data-composer-shell]') as HTMLElement, { clientX: 120, clientY: 90 });
    expect(screen.getByRole('dialog', { name: 'Adventure actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(draft.current).toBe('I keep my lantern raised.\nI search the area for anything useful or out of place.');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Adventure actions' })).not.toBeInTheDocument();
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('does not open while the composer is locked', () => {
    const draft = { current: '' };
    render(<ChatComposer {...defaults} isLocked draft={draft} />);
    fireEvent.contextMenu(screen.getByRole('textbox').closest('[data-composer-shell]') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Adventure actions' })).not.toBeInTheDocument();
  });
});
