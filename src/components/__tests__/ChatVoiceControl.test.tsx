import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatVoiceControl from '../ChatVoiceControl';

afterEach(cleanup);
it('makes the muted default discoverable with an accessible suggestion', () => {
  const toggle = vi.fn();
  render(<ChatVoiceControl enabled={false} status="idle" error={null} onToggle={toggle} onStop={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Unmute chat voice' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(button).toHaveAccessibleDescription('Hear Brain — unmute to bring the conversation to life');
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledOnce();
});
it('keeps mute available while preparing speech and exposes failures', () => {
  const { rerender } = render(<ChatVoiceControl enabled status="loading" error={null} onToggle={() => {}} onStop={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Mute chat voice' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('Preparing Brain’s voice');
  rerender(<ChatVoiceControl enabled={false} status="idle" error="Voice unavailable" onToggle={() => {}} onStop={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Voice unavailable');
});

it('integrates voice into the command rail with a stateful waveform and Brain flyout', () => {
  const toggle = vi.fn();
  const { container, rerender } = render(<ChatVoiceControl placement="rail" enabled={false} status="idle" error={null} onToggle={toggle} onStop={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Unmute chat voice' });
  expect(container.querySelector('.cosmic-voice-wave')).toHaveAttribute('data-voice-state', 'muted');
  expect(screen.getByRole('tooltip')).toHaveTextContent('Brain’s voice');
  expect(button).toHaveAccessibleDescription(expect.stringContaining('Hear Brain'));
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledOnce();
  rerender(<ChatVoiceControl placement="rail" enabled status="playing" error={null} onToggle={toggle} onStop={vi.fn()} />);
  expect(container.querySelector('.cosmic-voice-wave')).toHaveAttribute('data-voice-state', 'playing');
  expect(container.querySelector('.cosmic-voice-led')).toHaveAttribute('data-enabled', 'true');
  expect(screen.getByRole('button', { name: 'Mute chat voice' })).toHaveAttribute('aria-pressed', 'true');
});

it('can stop a single-reply listen without enabling automatic voice', () => {
  const toggle = vi.fn(); const stop = vi.fn();
  const { rerender } = render(<ChatVoiceControl placement="rail" enabled={false} status="playing" error={null} onToggle={toggle} onStop={stop} />);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Automatic voice stays muted');
  fireEvent.click(screen.getByRole('button', { name: 'Stop reply audio' }));
  expect(stop).toHaveBeenCalledOnce(); expect(toggle).not.toHaveBeenCalled();
  rerender(<ChatVoiceControl placement="rail" enabled={false} status="idle" error={null} onToggle={toggle} onStop={stop} />);
  expect(screen.getByRole('button', { name: 'Unmute chat voice' })).toHaveAttribute('aria-pressed', 'false');
});
