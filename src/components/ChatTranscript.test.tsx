import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ChatTranscript from './ChatTranscript';
import ChatComposer from './ChatComposer';
import { BRAIN_CHAT, GAME_MASTER_CHAT } from '../chat/experienceAdapters';
import type { ChatComposerConfiguration } from '../chat/presentation';
import type { Message } from './MessageBubble';

afterEach(cleanup);
const messages: Message[] = [
  { role: 'user', content: 'I open the door.' },
  { role: 'assistant', content: 'The door opens onto a quiet garden.', sensations: ['Wet stone underfoot.'], thoughts: ['The silence might be deliberate.'], memories: 'You passed this gate before.', selfReflection: 'Not every invitation announces itself.' },
];
const FUTURE_CHAT: ChatComposerConfiguration = {
  actions: [{ id: 'research', label: 'Research', command: 'research', prompt: 'Compare these sources.', hint: 'Review evidence', icon: 'list' }],
  quickActions: [], inputLabel: 'Your research question', suggestCompletion: () => '',
};

it('uses identical message markup, disclosure, copy, and listen across all experience skins', () => {
  const structures = [];
  for (const mode of ['brain', 'gm', 'future']) {
    const listen = vi.fn();
    const { container, unmount } = render(<div className={`retro-rpg-ui--${mode}`}><ChatTranscript messages={messages} onListen={listen} /></div>);
    structures.push([...container.querySelectorAll('.retro-message-row, .message-bubble, .cosmic-chat-prose, .cosmic-message-actions')].map(node => node.className));
    expect(screen.getByText('Brain')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show message thoughts' }));
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('Wet stone underfoot.');
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('The silence might be deliberate.');
    expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('You passed this gate before.');
    fireEvent.click(screen.getByRole('button', { name: 'Listen to Brain’s reply' }));
    expect(listen).toHaveBeenCalledExactlyOnceWith(messages[1].content);
    expect(screen.getByRole('button', { name: 'Copy reply' })).toBeInTheDocument();
    unmount();
  }
  expect(structures[1]).toEqual(structures[0]);
  expect(structures[2]).toEqual(structures[0]);
});

it.each([BRAIN_CHAT, GAME_MASTER_CHAT, FUTURE_CHAT])('accepts composer content capabilities without branching the UI', configuration => {
  const onSend = vi.fn();
  const { container } = render(<ChatComposer configuration={configuration} draft={{ current: 'Keep this draft.' }} onSend={onSend}
    placeholder="Write a message" isLocked={false} isWaiting={false} isPrimed={false} />);
  expect(container.querySelector('.cosmic-composer.cosmic-chat-surface')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Browse chat actions' })).toBeNull();
  fireEvent.contextMenu(screen.getByRole('textbox').closest('[data-composer-shell]') as HTMLElement, { clientX: 200, clientY: 100 });
  expect(screen.getByRole('dialog', { name: 'Chat actions' })).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft.');
  expect(onSend).not.toHaveBeenCalled();
});

it('lets future modes supply rich extensions without replacing standard chat', () => {
  render(<ChatTranscript messages={[...messages, { role: 'assistant', content: 'extension' }]}
    renderExtension={message => message.content === 'extension' ? <aside aria-label="Research sources">Two sources available</aside> : undefined} />);
  expect(screen.getByRole('complementary', { name: 'Research sources' })).toBeInTheDocument();
  expect(screen.getByText('The door opens onto a quiet garden.')).toBeInTheDocument();
});
