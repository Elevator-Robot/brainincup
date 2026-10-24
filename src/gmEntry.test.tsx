import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({
  brainLookups: vi.fn(async () => ({ data: [{ id: 'account-brain', experience: 'brain', personalityMode: 'brain' }] })),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(async () => ({ data: null })),
  createCharacter: vi.fn(),
  savedCharacter: undefined as Record<string, unknown> | undefined,
}));
vi.mock('aws-amplify/auth', () => ({
  fetchUserAttributes: async () => ({ sub: 'user-1', email: 'test@example.invalid' }), signOut: vi.fn(),
}));
vi.mock('./api/dataClient', () => ({ dataClient: {
  models: {
    Conversation: {
      list: account.brainLookups,
      get: async ({ id }: { id: string }) => ({ data: { id, experience: id === 'account-brain' ? 'brain' : 'game_master' } }),
      create: account.createConversation, delete: account.deleteConversation,
      update: async () => ({ data: null }),
    },
    GameMasterCharacter: { list: async () => ({ data: account.savedCharacter ? [account.savedCharacter] : [] }), create: account.createCharacter },
    Message: { list: async () => ({ data: [] }), create: async () => ({ data: { id: 'opening-message' } }) },
    BrainResponse: { list: async () => ({ data: [] }) },
    GameMasterAdventure: {
      list: async () => ({ data: [{ id: 'adventure-1', conversationId: 'new-adventure', currentLocation: 'Starfall Observatory' }] }),
      create: async () => ({ data: null }),
      observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
    },
    GameMasterQuestStep: { list: async () => ({ data: [] }) },
    ActiveQuest: { observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) },
    PlayerState: { observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) },
  },
  graphql: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
} }));
vi.mock('./components/ConversationSidebarIcons', () => ({ default: ({ onNewConversation, isDisabled }: { onNewConversation: () => void; isDisabled: boolean }) =>
  <button onClick={onNewConversation} disabled={isDisabled}>Create new character</button> }));
vi.mock('./hooks/useChatScroll', () => ({ useChatScroll: () => ({
  scrollRef: { current: null }, contentRef: { current: null }, isAtBottom: true, scrollToLatest() {},
}) }));
vi.mock('./utils/aguiStream', () => ({ streamAgentMessage: async () => {} }));

it('keeps production-mode GM creation open after leaving Brain, including slow API creation and direct /quest/new entry', async () => {
  const previous = location.href;
  history.replaceState(null, '', '/brain/account-brain');
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') || query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {},
  }));
  let finishConversation: ((data: Record<string, unknown> | null) => void) | undefined;
  let finishBrainLookup: (() => void) | undefined;
  account.createConversation.mockImplementation(() => new Promise(resolve => {
    finishConversation = data => { finishConversation = undefined; resolve({ data }); };
  }));
  account.createCharacter.mockImplementation(async (payload: Record<string, unknown>) => {
    account.savedCharacter = { ...payload, id: 'hero-1' };
    return { data: account.savedCharacter };
  });
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  const { router } = await import('./router');
  const { queryClient } = await import('./queries/queryClient');
  try {
    render(<WorkspaceShell />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create new character' })).not.toBeDisabled(), { timeout: 5000 });
    expect(location.pathname).toBe('/brain/account-brain');
    fireEvent.click(screen.getByRole('button', { name: 'Create new character' }));
    await waitFor(() => expect(account.brainLookups.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => { await Promise.resolve(); });
    expect(location.pathname).toBe('/quest/new');
    expect(screen.getByRole('dialog', { name: 'Forge your legend' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Game context' })).toBeNull();
    expect(account.createConversation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel character creation' }));
    await waitFor(() => expect(location.pathname).toBe('/brain/account-brain'));
    expect(account.deleteConversation).not.toHaveBeenCalled();

    const brainRecord = { id: 'account-brain', experience: 'brain', personalityMode: 'brain' };
    const delayedBrain = new Promise<{ data: typeof brainRecord[] }>(resolve => {
      finishBrainLookup = () => { finishBrainLookup = undefined; resolve({ data: [brainRecord] }); };
    });
    account.brainLookups.mockImplementation(() => delayedBrain);
    act(() => { void router.navigate({ to: '/quest/$conversationId', params: { conversationId: 'new' } }); });
    await screen.findByRole('dialog', { name: 'Forge your legend' }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel character creation' }));
    await waitFor(() => expect(location.pathname.startsWith('/brain/')).toBe(true));
    expect(screen.queryByRole('dialog', { name: 'Forge your legend' })).toBeNull();
    await act(async () => { finishBrainLookup?.(); });
    await waitFor(() => expect(location.pathname).toBe('/brain/account-brain'));
    account.brainLookups.mockResolvedValue({ data: [brainRecord] });

    act(() => { void router.navigate({ to: '/quest/$conversationId', params: { conversationId: 'new' } }); });
    expect(await screen.findByRole('dialog', { name: 'Forge your legend' }, { timeout: 5000 })).toBeInTheDocument();
    expect(location.pathname).toBe('/quest/new');
    fireEvent.click(screen.getByRole('button', { name: 'Choose your calling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Wizard calling' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bring them to life' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Character name' }), { target: { value: 'Lyra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Begin adventure' }));
    await waitFor(() => expect(account.createConversation).toHaveBeenCalledTimes(1));
    expect(location.pathname).toBe('/quest/new');
    expect(screen.getByRole('dialog', { name: 'Forge your legend' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Game context' })).toBeNull();
    expect(account.createCharacter).not.toHaveBeenCalled();
    await act(async () => { finishConversation?.({ id: 'new-adventure', experience: 'game_master', personalityMode: 'game_master' }); });
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Game context' })).toBeInTheDocument(), { timeout: 6000 });
    expect(location.pathname).toBe('/quest/new-adventure');
    expect(account.createConversation).toHaveBeenCalledTimes(1);
    expect(account.createCharacter).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Forge your legend' })).toBeNull();
  } finally {
    await act(async () => { finishBrainLookup?.(); finishConversation?.(null); });
    cleanup(); queryClient.clear(); vi.unstubAllGlobals();
    localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', previous);
  }
}, 15_000);
