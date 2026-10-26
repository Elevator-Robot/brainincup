import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MessageActions from './MessageActions';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('copies only the supplied public reply and confirms completion', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<MessageActions content="The **public** reply." />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
  expect(await screen.findByRole('button', { name: 'Reply copied' })).toBeInTheDocument();
  expect(writeText).toHaveBeenCalledExactlyOnceWith('The **public** reply.');
});
it('exposes a non-destructive fallback when clipboard access fails', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
  render(<MessageActions content="Still selectable." />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Select the reply text to copy it.'));
});
it('keeps explicit listen independent of copying', () => {
  const listen = vi.fn();
  render(<MessageActions content="A familiar voice." onListen={listen} />);
  fireEvent.click(screen.getByRole('button', { name: 'Listen to Brain’s reply' }));
  expect(listen).toHaveBeenCalledExactlyOnceWith('A familiar voice.');
});
