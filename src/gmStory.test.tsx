import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StreamAgentParams } from './utils/aguiStream';
import { initialStory } from './dev/storyDemo';

const api = vi.hoisted(() => ({
  stream: vi.fn(),
  updateMessage: vi.fn(async () => ({ data: null })),
  nextMessageId: 'answer',
  characterListGate: undefined as Promise<void> | undefined,
  subscribe: undefined as ((result: unknown) => void) | undefined,
  messages: [{ id: 'opening', content: 'Begin adventure', timestamp: '2026-01-01T00:00:00Z' }],
}));
vi.mock('aws-amplify/auth', () => ({ fetchUserAttributes: async () => ({ sub: 'user-1' }), signOut: vi.fn() }));
vi.mock('./api/dataClient', () => ({ dataClient: {
  models: {
    Conversation: {
      list: async () => ({ data: [{ id: 'brain', experience: 'brain', personalityMode: 'brain' }] }),
      get: async () => ({ data: { id: 'adventure', experience: 'game_master', personalityMode: 'game_master' } }),
      update: async () => ({ data: null }),
    },
    GameMasterCharacter: {
      list: async () => {
        await api.characterListGate;
        return { data: [{ id: 'character', conversationId: 'adventure', name: 'Sera', race: 'Human',
          characterClass: 'Rogue', level: 1, currentHP: 12, maxHP: 12, experience: 0, inventory: '[]' }] };
      },
    },
    GameMasterAdventure: {
      list: async () => ({ data: [{ id: 'gm:adventure', conversationId: 'adventure', currentLocation: 'alderheart_square' }] }),
      observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
    },
    GameMasterQuestStep: { list: async () => ({ data: [] }), create: async () => ({ data: null }) },
    GameMasterPlayerChoice: { create: async () => ({ data: null }) },
    PlayerState: { observeQuery: () => ({ subscribe: ({ next }: { next: (value: unknown) => void }) => {
      next({ items: [{ id: 'ps', campaignId: 'adventure', currentXP: 0, currentLevel: 1, xpToNextLevel: 100 }] });
      return { unsubscribe() {} };
    } }) },
    ActiveQuest: { observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) },
    Message: {
      list: async () => ({ data: api.messages }),
      create: async ({ content }: { content: string }) => ({ data: { id: api.nextMessageId, content } }),
      update: api.updateMessage,
    },
    BrainResponse: { list: async () => ({ data: [{
      id: 'response', messageId: 'opening', response: 'Where did your character come from?',
      story: JSON.stringify({ version: 1, stageId: 'introduction', title: 'A stranger in Alderheart', objective: 'Define your character.',
        questionIndex: 0, questionCount: 4, details: [], memoryStatus: 'local',
        progression: { currentXP: 0, currentLevel: 1, xpToNextLevel: 100 } }),
      gameEvents: JSON.stringify([{ version: 1, id: 'stage-1', kind: 'stage', title: 'Introduction', detail: 'Your story begins.' }]),
    }] }) },
  },
  graphql: () => ({ subscribe: ({ next }: { next: (result: unknown) => void }) => {
    api.subscribe = next; return { unsubscribe() {} };
  } }),
} }));
vi.mock('./utils/aguiStream', () => ({ streamAgentMessage: api.stream }));
vi.mock('./components/ConversationSidebarIcons', () => ({ default: () => <nav aria-label="Global menu" /> }));
vi.mock('./components/DiceRoller', () => ({ default: ({ actionLabel, disabled }: { actionLabel: string; disabled: boolean }) =>
  <button disabled={disabled}>{actionLabel}</button> }));
vi.mock('./hooks/useChatScroll', () => ({ useChatScroll: () => ({
  scrollRef: { current: null }, contentRef: { current: null }, isAtBottom: true, scrollToLatest() {},
}) }));

const originalUrl = location.href;
beforeEach(() => {
  api.stream.mockReset();
  api.updateMessage.mockClear();
  api.nextMessageId = 'answer';
  api.characterListGate = undefined;
  history.replaceState(null, '', '/quest/adventure');
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width') || query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }));
});
afterEach(async () => {
  cleanup();
  const { queryClient } = await import('./queries/queryClient');
  queryClient.clear(); vi.unstubAllGlobals();
  localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', originalUrl);
});

it('hydrates RPG events, waits for commit, reconciles the matching response, and never invents intro XP', async () => {
  let active: StreamAgentParams | undefined;
  let finish: (() => void) | undefined;
  api.stream.mockImplementation((params: StreamAgentParams) => {
    active = params; return new Promise<void>(resolve => { finish = resolve; });
  });
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  try {
    render(<WorkspaceShell />);
    await screen.findByText('Where did your character come from?', {}, { timeout: 5000 });
    expect(screen.getByRole('list', { name: 'Adventure events' })).toHaveTextContent('Introduction');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'I was a cartographer.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(api.stream).toHaveBeenCalledOnce());
    expect(screen.getByRole('meter', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '0');
    act(() => api.subscribe?.({ data: { onCreateBrainResponse: {
      id: 'late-opening', messageId: 'opening', conversationId: 'adventure', response: 'Where did your character come from?',
      story: JSON.stringify(initialStory),
    } } }));
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.getAllByText('Where did your character come from?')).toHaveLength(1);
    act(() => {
      active!.onEvent({ type: 'TEXT_MESSAGE_START', messageId: 'generated-id' });
      active!.onEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'Your past is recorded. What brings you here?' });
      active!.onEvent({ type: 'TEXT_MESSAGE_END', messageId: 'generated-id' });
    });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    const story = { ...initialStory, questionIndex: 1,
      details: [{ id: 'origin', title: 'The road behind you', answer: 'I was a cartographer.' }],
      progression: { currentXP: 0, currentLevel: 1, xpToNextLevel: 100 } };
    const events = [{ version: 1, id: 'detail-1', kind: 'character', title: 'Origin recorded', detail: 'I was a cartographer.' }];
    await act(async () => {
      active!.onEvent({ type: 'STATE_SNAPSHOT', snapshot: { character: { currentHP: 10, maxHP: 12, xp: 0, inventory: [] } } });
      active!.onEvent({ type: 'CUSTOM', name: 'response_complete', value: {
        response: 'Your past is recorded. What brings you here?', metadata: { story, game_events: events },
      } });
      finish?.();
    });
    expect(screen.getByText('Origin recorded')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Character story' })).toHaveTextContent('I was a cartographer.');
    expect(screen.getByRole('meter', { name: 'Health' })).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByRole('meter', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '0');
    // Publishing the same response twice reconciles this bubble.
    act(() => api.subscribe?.({ data: { onCreateBrainResponse: {
      id: 'answer-response', messageId: 'answer', conversationId: 'adventure', response: 'Your past is recorded. What brings you here?',
      gameEvents: JSON.stringify(events), story: JSON.stringify(story),
    } } }));
    expect(screen.getAllByText('Origin recorded')).toHaveLength(1);
    expect(await screen.findAllByText('Your past is recorded. What brings you here?', {}, { timeout: 5000 })).toHaveLength(1);
  } finally {
    await act(async () => finish?.());
  }
}, 10_000);

it('recovers a truncated stream through AppSync, including the pending check and authoritative context', async () => {
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  api.stream.mockImplementation(async (params: StreamAgentParams) => {
    params.onEvent({ type: 'TEXT_MESSAGE_START' });
    params.onEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'A partial response' });
    params.onEvent({ type: 'TEXT_MESSAGE_END' });
  });
  render(<WorkspaceShell />);
  await screen.findByText('Where did your character come from?');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Climb the wall.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(api.updateMessage).toHaveBeenCalledWith({ id: 'answer', streaming: false }));
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  const story = { ...initialStory, introComplete: true,
    character: { currentHP: 9, maxHP: 12, xp: 20, level: 1, inventory: [] }, location: 'whispering_tankard',
    progression: { currentXP: 20, currentLevel: 1, xpToNextLevel: 100 },
    pendingDiceRoll: { requestId: 'check', statName: 'dexterity', statValue: 14, difficultyClass: 12,
      description: 'Climb the wall.', expiresAt: new Date(Date.now() + 60_000).toISOString() } };
  const publish = () => api.subscribe?.({ data: { onCreateBrainResponse: {
    id: 'answer-response', messageId: 'answer', conversationId: 'adventure', response: 'A check awaits.',
    story: JSON.stringify(story),
  } } });
  act(publish);
  await screen.findByText('A check awaits.', {}, { timeout: 5000 });
  expect(screen.getByRole('meter', { name: 'Health' })).toHaveAttribute('aria-valuenow', '9');
  expect(screen.getByRole('meter', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '20');
  await screen.findByRole('region', { name: 'dexterity check' });
  expect(screen.getByRole('button', { name: 'Roll d20' })).toBeEnabled();
  act(publish);
  expect(screen.getAllByText('A check awaits.')).toHaveLength(1);
  expect(screen.getAllByRole('region', { name: 'dexterity check' })).toHaveLength(1);
});

it('shows a terminal failure before narration without leaving the composer locked', async () => {
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  api.stream.mockImplementation(async (params: StreamAgentParams) => {
    params.onEvent({ type: 'RUN_ERROR', message: 'The turn could not be saved.' });
  });
  render(<WorkspaceShell />);
  await screen.findByText('Where did your character come from?');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'An answer.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('The turn could not be saved.');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Try again.' } });
  expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
});

it('applies cached authoritative character context after the character row finishes loading', async () => {
  let loadCharacter: (() => void) | undefined;
  api.characterListGate = new Promise<void>(resolve => { loadCharacter = resolve; });
  localStorage.setItem('messagesCache:adventure', JSON.stringify([{
    role: 'assistant', messageId: 'opening', content: 'Your saved adventure.',
    story: { ...initialStory, character: { currentHP: 7, maxHP: 12, experience: 20 },
      progression: { currentXP: 20, currentLevel: 1, xpToNextLevel: 100 } },
  }]));
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  render(<WorkspaceShell />);
  await screen.findByText('Your saved adventure.');
  await act(async () => loadCharacter?.());
  await waitFor(() => expect(screen.getByRole('meter', { name: 'Health' })).toHaveAttribute('aria-valuenow', '7'));
  expect(screen.getByRole('meter', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '20');
});

it.each(['end', 'network error'])('ignores late stream chunks and %s after AppSync confirms the turn', async (ending) => {
  let active: StreamAgentParams | undefined;
  let finish: (() => void) | undefined;
  let disconnect: (() => void) | undefined;
  api.stream.mockImplementation((params: StreamAgentParams) => {
    active = params; return new Promise<void>((resolve, reject) => {
      finish = resolve; disconnect = () => reject(new Error('Connection closed'));
    });
  });
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  render(<WorkspaceShell />);
  await screen.findByText('Where did your character come from?');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I was a cartographer.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(active).toBeDefined());
  try {
    act(() => {
      active!.onEvent({ type: 'TEXT_MESSAGE_START' });
      active!.onEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: 'Your past' });
      api.subscribe?.({ data: { onCreateBrainResponse: {
        id: 'answer-response', messageId: 'answer', conversationId: 'adventure', response: 'Your past is recorded.',
      } } });
    });
    await act(async () => {
      active!.onEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: ' is recorded.' });
      active!.onEvent({ type: 'TEXT_MESSAGE_END' });
      if (ending === 'network error') disconnect?.();
      else finish?.();
    });
    expect(await screen.findAllByText('Your past is recorded.', {}, { timeout: 5000 })).toHaveLength(1);
    expect(api.updateMessage).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The next answer.' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
  } finally {
    await act(async () => finish?.());
  }
});
