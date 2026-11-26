import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';
import { GAME_MASTER_CHAT } from '../../chat/experienceAdapters';

const defaults = {
  onSend: vi.fn().mockResolvedValue(true),
  isLocked: false,
  isWaiting: false,
  isPrimed: false,
  configuration: GAME_MASTER_CHAT,
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

  it('keeps native placeholders out of the value and predictive hints inert until accepted', () => {
    const { container, input } = renderComposer();
    expect(input).toHaveAttribute('placeholder', 'Your next action');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'I look' } });
    const hint = container.querySelector('[data-ui-placeholder]') as HTMLElement;
    expect(hint).toHaveAttribute('aria-hidden', 'true');
    expect(hint.inert).toBe(true);
    expect(hint).toHaveTextContent('around carefully.');
    expect(input).toHaveValue('I look');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input).toHaveValue('I look around carefully.');
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

describe('explicit action access', () => {
  it('opens all actions from the button and appends a selection without sending', () => {
    const { draft, input } = renderComposer('I keep my lantern raised.');
    fireEvent.click(screen.getByRole('button', { name: 'Browse chat actions' }));
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByRole('option', { selected: true })).toHaveFocus();
    fireEvent.click(screen.getByRole('option', { name: /Search/ }));
    expect(draft.current).toBe('I keep my lantern raised.\nI search the area for anything useful or out of place.');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('supports keyboard browsing and dismissal while preserving slash suggestions', () => {
    const { draft, input } = renderComposer();
    const trigger = screen.getByRole('button', { name: 'Browse chat actions' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('option', { selected: true }), { key: 'End' });
    expect(screen.getByRole('option', { selected: true })).toHaveFocus();
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Roll');
    fireEvent.keyDown(screen.getByRole('option', { selected: true }), { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(draft.current).toBe('');
    fireEvent.change(input, { target: { value: '/' } });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(draft.current).toBe('/');
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('dismisses on outside interaction and closes if sending locks the composer', () => {
    const { rerender, draft } = renderComposer('A draft');
    const trigger = screen.getByRole('button', { name: 'Browse chat actions' });
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(draft.current).toBe('A draft');
    fireEvent.click(trigger);
    rerender(<ChatComposer {...defaults} draft={draft} isLocked />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toBeDisabled();
    rerender(<ChatComposer {...defaults} draft={draft} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('action wheel', () => {
  const pointer = (target: Element, type: 'pointermove' | 'pointerup', init: MouseEventInit) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, ...init }));

  it('keeps the wheel open when the opening right-click is released', () => {
    const { draft, input } = renderComposer('Keep this draft.');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Browse chat actions' }), { clientX: 200, clientY: 200 });
    const wheel = screen.getByRole('dialog', { name: 'Chat actions' });
    pointer(wheel, 'pointerup', { button: 2, clientX: 200, clientY: 200 });
    expect(wheel).toBeInTheDocument();
    expect(draft.current).toBe('Keep this draft.');
    fireEvent.keyDown(wheel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Chat actions' })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('does not mistake small movement near a clamped wheel for a selection', () => {
    const { draft } = renderComposer('Keep this draft.');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Browse chat actions' }), { clientX: 200, clientY: 750 });
    const wheel = screen.getByRole('dialog', { name: 'Chat actions' });
    vi.spyOn(wheel, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 458, 300, 300));
    pointer(wheel, 'pointermove', { buttons: 2, clientX: 201, clientY: 750 });
    pointer(wheel, 'pointerup', { button: 2, clientX: 201, clientY: 750 });
    expect(wheel).toBeInTheDocument();
    expect(draft.current).toBe('Keep this draft.');
  });

  it('stages a held right-button flick released directly over an action', () => {
    const { draft, input } = renderComposer('Keep this draft.');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Browse chat actions' }), { clientX: 200, clientY: 200 });
    const wheel = screen.getByRole('dialog', { name: 'Chat actions' });
    vi.spyOn(wheel, 'getBoundingClientRect').mockReturnValue(new DOMRect(50, 50, 300, 300));
    const search = screen.getByRole('button', { name: 'Search' });
    pointer(search, 'pointermove', { buttons: 2, clientX: 290, clientY: 252 });
    pointer(search, 'pointerup', { button: 2, clientX: 290, clientY: 252 });
    expect(draft.current).toBe('Keep this draft.\nI search the area for anything useful or out of place.');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Chat actions' })).not.toBeInTheDocument();
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('dismisses an outside click without staging the previously hovered action', () => {
    const { draft, input } = renderComposer('Keep this draft.');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Browse chat actions' }), { clientX: 200, clientY: 200 });
    const layer = screen.getByRole('dialog', { name: 'Chat actions' }).parentElement!;
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Search' }));
    pointer(layer, 'pointerup', { button: 0, clientX: 0, clientY: 0 });
    fireEvent.click(layer);
    expect(draft.current).toBe('Keep this draft.');
    expect(screen.queryByRole('dialog', { name: 'Chat actions' })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('opens on right-click and appends the chosen action to the draft', () => {
    const { draft, input } = renderComposer('I keep my lantern raised.');
    fireEvent.contextMenu(input.closest('[data-composer-shell]') as HTMLElement, { clientX: 120, clientY: 90 });
    expect(screen.getByRole('dialog', { name: 'Chat actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(draft.current).toBe('I keep my lantern raised.\nI search the area for anything useful or out of place.');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Chat actions' })).not.toBeInTheDocument();
    expect(defaults.onSend).not.toHaveBeenCalled();
  });

  it('does not open while the composer is locked', () => {
    const draft = { current: '' };
    render(<ChatComposer {...defaults} isLocked draft={draft} />);
    fireEvent.contextMenu(screen.getByRole('textbox').closest('[data-composer-shell]') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Chat actions' })).not.toBeInTheDocument();
  });
});
