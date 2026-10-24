import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatVoiceControl from '../ChatVoiceControl';

afterEach(cleanup);
it('makes the muted default discoverable with an accessible suggestion', () => {
  const toggle = vi.fn();
  render(<ChatVoiceControl enabled={false} status="idle" error={null} onToggle={toggle} />);
  const button = screen.getByRole('button', { name: 'Unmute chat voice' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveAccessibleDescription('Try Aaron’s voice — unmute to hear replies');
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledOnce();
});
it('keeps mute available while preparing speech and exposes failures', () => {
  const { rerender } = render(<ChatVoiceControl enabled status="loading" error={null} onToggle={() => {}} />);
  expect(screen.getByRole('button', { name: 'Mute chat voice' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing Aaron’s voice');
  rerender(<ChatVoiceControl enabled={false} status="idle" error="Voice unavailable" onToggle={() => {}} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Voice unavailable');
});
