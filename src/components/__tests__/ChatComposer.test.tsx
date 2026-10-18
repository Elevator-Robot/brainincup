import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatComposer from '../ChatComposer';

const defaults = { isLocked: false, isWaiting: false, isPrimed: false, placeholder: 'Message Brain' };

describe('ChatComposer', () => {
  it('keeps drafts while locked and does not submit IME or Shift+Enter', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const draft = { current: '' };
    const { rerender } = render(<ChatComposer {...defaults} draft={draft} onSend={onSend} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'A thought' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    rerender(<ChatComposer {...defaults} isLocked draft={draft} onSend={onSend} />);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
    expect(draft.current).toBe('A thought');
    rerender(<ChatComposer {...defaults} draft={draft} onSend={onSend} />);
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(onSend).toHaveBeenCalledExactlyOnceWith('A thought');
    expect(input).toHaveValue('');
    expect(draft.current).toBe('');
  });

  it('prevents duplicate submits and retains drafts when a conversation cannot be created', async () => {
    let resolve!: (accepted: boolean) => void;
    const onSend = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const draft = { current: 'Keep this draft' };
    const { unmount } = render(<ChatComposer {...defaults} draft={draft} onSend={onSend} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => resolve(false));
    expect(input).toHaveValue('Keep this draft');
    unmount();
    render(<ChatComposer {...defaults} draft={draft} onSend={onSend} />);
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  });

  it('keeps the draft and offers a retry after a send failure', async () => {
    const draft = { current: 'My unsent thought' };
    const onSend = vi.fn().mockRejectedValue(new Error('Offline'));
    render(<ChatComposer {...defaults} draft={draft} onSend={onSend} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send message' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Your draft is saved');
    expect(screen.getByRole('textbox')).toHaveValue('My unsent thought');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  });
});
