import { act, screen, waitFor } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { rememberBrainLogin } from './utils/loginLanding';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), navigate: vi.fn() }));
vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: auth.getUser }));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: () => () => {} } }));
vi.mock('./router', () => ({ router: { navigate: auth.navigate } }));
vi.mock('./WorkspaceShell', () => ({ default: () => <p>Workspace mounted</p> }));
vi.mock('./components/CustomAuth', () => ({ default: () => <p>Sign-in screen</p> }));
vi.mock('./components/SiteBackground', () => ({ default: () => null }));
vi.mock('./components/SiteFooter', () => ({ default: () => null }));
vi.mock('./components/TextArrivalEffects', () => ({ default: () => null }));
vi.mock('./utils/brainHandoff', () => ({ beginBrainHandoff: () => false, cancelBrainHandoff: () => {} }));

it('does not mount an old conversation while a cold OAuth return is still navigating to Brain', async () => {
  const previousUrl = location.href;
  history.replaceState(null, '', '/quest/last-adventure?code=synthetic&state=synthetic');
  localStorage.setItem('lastActiveConversationId', 'last-adventure');
  localStorage.setItem('lastPersonalityMode', 'game_master');
  rememberBrainLogin();
  auth.getUser.mockResolvedValue({ userId: 'user-1' });
  let finishNavigation: (() => void) | undefined;
  auth.navigate.mockImplementation(() => new Promise<void>(resolve => {
    finishNavigation = () => { history.replaceState(null, '', '/brain/new'); resolve(); };
  }));
  const element = document.createElement('div') as HTMLDivElement & { __brainInCupRoot?: Root };
  element.id = 'root'; document.body.append(element);
  try {
    await act(async () => { await import('./main'); });
    await waitFor(() => expect(auth.navigate).toHaveBeenCalledTimes(1));
    // StrictMode starts the auth effect twice. Neither check may let the old
    // workspace mount just because the other already consumed the OAuth marker.
    expect(screen.queryByText('Workspace mounted')).not.toBeInTheDocument();
    await act(async () => { finishNavigation?.(); });
    expect(await screen.findByText('Workspace mounted')).toBeInTheDocument();
    expect(location.pathname).toBe('/brain/new');
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { finishNavigation?.(); element.__brainInCupRoot?.unmount(); });
    element.remove(); localStorage.clear(); sessionStorage.clear();
    history.replaceState(null, '', previousUrl);
  }
});
