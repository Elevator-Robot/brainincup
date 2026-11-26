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
  it.each([true, false])('opens only one message at a time (stored IDs: %s)', withIds => {
    render(<MessageList messages={[
      { ...message, messageId: withIds ? 'first' : undefined },
      { role: 'assistant', messageId: withIds ? 'second' : undefined, content: 'The lantern shines.', thoughts: ['A new way forward.'] },
    ]} />);
    const first = screen.getByRole('button', { name: /The stars remember/ });
    const second = screen.getByRole('button', { name: 'The lantern shines.' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Show message thoughts' })[0]);
    const firstPanel = screen.getByRole('region', { name: 'Message thoughts' });
    second.focus();
    fireEvent.keyDown(second, { key: 'Enter' });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(firstPanel).toHaveAttribute('aria-hidden', 'true');
    expect(firstPanel.inert).toBe(true);
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('region', { name: 'Message thoughts' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('A new way forward.');
    fireEvent.click(first);
    expect(second).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toBe(firstPanel);
    fireEvent.click(first);
    expect(screen.queryByRole('region', { name: 'Message thoughts' })).not.toBeInTheDocument();
  });

  it('preserves an open message through updates but resets after clearing history', () => {
    const { rerender } = render(<MessageList messages={[message]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show message thoughts' }));
    rerender(<MessageList messages={[
      { ...message, thoughts: ['An updated thought.'] },
      { role: 'assistant', content: 'Another reply.', thoughts: ['Another thought.'] },
    ]} />);
    expect(screen.getAllByRole('region', { name: 'Message thoughts' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('An updated thought.');
    rerender(<MessageList messages={[]} />);
    rerender(<MessageList messages={[message]} />);
    expect(screen.queryByRole('region', { name: 'Message thoughts' })).not.toBeInTheDocument();
  });

  it('toggles by clicking the text in the shared message renderer', () => {
    render(<MessageList messages={[message]} />);
    expect(screen.queryByText('Explore thoughts')).not.toBeInTheDocument();
    expect(document.querySelector('.cosmic-insight-cue')).toBeNull();
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
    const collapsed = document.getElementById(panel.id)!;
    expect(collapsed).toHaveAttribute('data-expanded', 'false');
    expect(collapsed).toHaveAttribute('aria-hidden', 'true');
    expect(collapsed.inert).toBe(true);
  });

  it('supports Enter and Space without a separate visible link', () => {
    render(<MessageList messages={[message]} />);
    const trigger = screen.getByRole('button', { name: /The stars remember/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('also responds to its visible disclosure icon', () => {
    render(<MessageList messages={[message]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show message thoughts' }));
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide message thoughts' }));
    expect(screen.queryByRole('region', { name: 'Message thoughts' })).not.toBeInTheDocument();
  });

  it('does not toggle while selecting text or activating a Markdown link', () => {
    render(<MessageList messages={[message]} />);
    const trigger = screen.getByRole('button', { name: /The stars remember/ });
    fireEvent.click(screen.getByRole('link', { name: 'Read the map' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not imply hidden thoughts when no details exist', () => {
    render(<MessageList messages={[{ role: 'assistant', content: 'Just a message.' }]} />);
    expect(screen.queryByRole('button', { name: 'Just a message.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy reply' })).toBeInTheDocument();
    expect(document.querySelector('.cosmic-insight-trigger')).toBeNull();
  });
});
