import { act, screen, waitFor } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { rememberBrainLogin } from './utils/loginLanding';

const account = vi.hoisted(() => ({
  conversation: vi.fn(async ({ id }: { id: string }) => ({ data: {
    id, experience: id === 'account-brain' ? 'brain' : 'game_master', personalityMode: id === 'account-brain' ? 'brain' : 'game_master',
  } })),
  characters: vi.fn(async () => ({ data: [] })),
}));
vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }));
vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: async () => ({ userId: 'user-1' }),
  fetchUserAttributes: async () => ({ sub: 'user-1', email: 'test@example.invalid' }),
  signOut: vi.fn(),
}));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: () => () => {} } }));
vi.mock('./api/dataClient', () => ({ dataClient: {
  models: {
    Conversation: {
      list: async () => ({ data: [{ id: 'account-brain', experience: 'brain', personalityMode: 'brain' }] }),
      get: account.conversation,
    },
    Message: { list: async () => ({ data: [] }) },
    BrainResponse: { list: async () => ({ data: [] }) },
    GameMasterCharacter: { list: account.characters },
    GameMasterAdventure: { list: async () => ({ data: [] }), create: async () => ({ data: null }) },
    GameMasterQuestStep: { list: async () => ({ data: [] }) },
    ActiveQuest: { observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) },
    PlayerState: { observeQuery: () => ({ subscribe: () => ({ unsubscribe() {} }) }) },
  },
  graphql: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
} }));
vi.mock('./components/CustomAuth', () => ({ default: () => <p>Sign-in screen</p> }));
vi.mock('./components/ConversationSidebarIcons', () => ({ default: () => <nav aria-label="Global menu" /> }));
vi.mock('./components/SiteBackground', () => ({ default: () => null }));
vi.mock('./components/SiteFooter', () => ({ default: () => null }));
vi.mock('./components/TextArrivalEffects', () => ({ default: () => null }));
vi.mock('./hooks/useChatScroll', () => ({ useChatScroll: () => ({
  scrollRef: { current: null }, contentRef: { current: null }, isAtBottom: true, scrollToLatest() {},
}) }));

it('mounts the real router and App in the account Brain conversation after a cold Google return', async () => {
  const previous = location.href;
  history.replaceState(null, '', '/quest/last-adventure?code=synthetic&state=synthetic');
  localStorage.setItem('lastActiveConversationId', 'last-adventure');
  localStorage.setItem('lastPersonalityMode', 'game_master');
  rememberBrainLogin();
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') || query.includes('reduced-motion'),
    addEventListener() {}, removeEventListener() {},
  }));
  const element = document.createElement('div') as HTMLDivElement & { __brainInCupRoot?: Root };
  element.id = 'root'; document.body.append(element);
  try {
    await act(async () => { await import('./main'); });
    expect(await screen.findByRole('region', { name: 'Brain presence' }, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(location.pathname).toBe('/brain/account-brain'), { timeout: 5000 });
    expect(account.conversation).toHaveBeenCalledWith({ id: 'account-brain' });
    expect(account.conversation).not.toHaveBeenCalledWith({ id: 'last-adventure' });
    expect(account.characters).not.toHaveBeenCalled();
    expect(document.querySelector('.retro-rpg-ui--gm, [data-character-creation]')).toBeNull();
  } finally {
    act(() => element.__brainInCupRoot?.unmount());
    const { queryClient } = await import('./queries/queryClient');
    queryClient.clear(); element.remove();
    vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
    history.replaceState(null, '', previous);
  }
});
