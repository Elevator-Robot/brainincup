import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { parseRpgEvents, parseStorySnapshot } from './rpgEvents';
import { gameMasterMessageExtension } from './gameMasterMessages';
import ChatTranscript from '../components/ChatTranscript';
import { answerStory, openingStory } from '../dev/storyDemo';
import StoryProgress from '../components/context/StoryProgress';

afterEach(cleanup);
const event = { version: 1, id: 'stage-1', kind: 'stage', title: 'The missing light', detail: 'Find Bram.' } as const;

it('hydrates AWSJSON and SSE identically, rejects malformed envelopes, and deduplicates IDs', () => {
  expect(parseRpgEvents(JSON.stringify([event]))).toEqual(parseRpgEvents([event]));
  expect(parseRpgEvents([event, event, { version: 2, id: 'future' }, null])).toEqual([event]);
  expect(parseRpgEvents('{bad json')).toEqual([]);
  expect(parseStorySnapshot({ version: 99 })).toBeUndefined();
});

it('appends events while preserving shared narration, thoughts and voice content', () => {
  const listen = vi.fn();
  const message = { role: 'assistant' as const, content: 'The lantern gutters.', thoughts: ['An old light.'], gameEvents: [event] };
  render(<ChatTranscript messages={[message]} renderExtension={gameMasterMessageExtension({})} onListen={listen} />);
  expect(screen.getByText('The lantern gutters.')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Adventure events' })).toHaveTextContent('Find Bram.');
  fireEvent.click(screen.getByRole('button', { name: 'Show message thoughts' }));
  expect(screen.getByRole('region', { name: 'Message thoughts' })).toHaveTextContent('An old light.');
  fireEvent.click(screen.getByRole('button', { name: 'Listen to Brain’s reply' }));
  expect(listen).toHaveBeenCalledWith(message.content, message);
});

it('does not show authoritative events for unfinished or failed turns', () => {
  render(<ChatTranscript messages={[{ role: 'assistant', content: 'Pending', isTyping: true, gameEvents: [event] }]}
    renderExtension={gameMasterMessageExtension({})} />);
  expect(screen.queryByRole('list', { name: 'Adventure events' })).not.toBeInTheDocument();
});

it('renders unknown event kinds as generic facts and escapes player text', () => {
  render(<ChatTranscript messages={[{ role: 'assistant', content: 'A fact.', gameEvents: [{ ...event, kind: 'future', detail: '<script>no()</script>' }] }]}
    renderExtension={gameMasterMessageExtension({})} />);
  expect(screen.getByText('Event')).toBeInTheDocument();
  expect(screen.getByText('<script>no()</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

it('shows the same saved character details after history hydration without claiming cloud sync', () => {
  const opening = openingStory({ name: 'Sera', race: 'Halfling', characterClass: 'Rogue' });
  const answered = answerStory(opening.story!, 'A cartographer from the coast.');
  const hydrated = parseStorySnapshot(JSON.stringify(answered.story))!;
  render(<StoryProgress story={hydrated} showDetails />);
  expect(screen.getByText('A cartographer from the coast.')).toBeInTheDocument();
  expect(screen.getByText('Saved to adventure')).toBeInTheDocument();
  expect(screen.queryByText(/memory synced/i)).not.toBeInTheDocument();
});
