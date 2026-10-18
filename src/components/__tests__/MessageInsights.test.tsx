import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessageList from '../MessageList';
import type { Message } from '../MessageBubble';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const message: Message = {
  role: 'assistant', content: 'The stars remember. [Read the map](https://example.com/map).',
  thoughts: ['The compass and the stars are connected.'],
  memories: 'A constellation vanished three nights ago.',
};

describe('thoughts unfold from the message', () => {
  it.each(['desktop', 'mobile'] as const)('toggles by clicking the text on %s', variant => {
    render(<MessageList messages={[message]} isGameMasterMode={false} variant={variant} />);
    expect(screen.queryByText('Explore thoughts')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /The stars remember/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const panel = screen.getByRole('region', { name: 'Message thoughts' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', panel.id);
    expect(panel.closest('.message-bubble')).toBe(trigger.closest('.message-bubble'));
    expect(screen.getByText(/The compass and the stars/)).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('region', { name: 'Message thoughts' })).not.toBeInTheDocument();
  });

  it('supports Enter and Space without a separate visible link', () => {
    render(<MessageList messages={[message]} isGameMasterMode={false} variant="desktop" />);
    const trigger = screen.getByRole('button', { name: /The stars remember/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not toggle while selecting text or activating a Markdown link', () => {
    render(<MessageList messages={[message]} isGameMasterMode={false} variant="desktop" />);
    const trigger = screen.getByRole('button', { name: /The stars remember/ });
    fireEvent.click(screen.getByRole('link', { name: 'Read the map' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not imply hidden thoughts when no details exist', () => {
    render(<MessageList messages={[{ role: 'assistant', content: 'Just a message.' }]} isGameMasterMode={false} variant="desktop" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.querySelector('.cosmic-insight-cue')).toBeNull();
  });
});
