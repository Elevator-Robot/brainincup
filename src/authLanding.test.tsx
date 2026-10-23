import { act, fireEvent, screen } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(), navigate: vi.fn().mockResolvedValue(undefined),
  listener: undefined as undefined | ((event: { payload: { event: string } }) => void),
}));
vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }));
vi.mock('aws-amplify/auth', () => ({ getCurrentUser: auth.getUser }));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: (_channel: string, listener: typeof auth.listener) => {
  auth.listener = listener;
  return () => { auth.listener = undefined; };
} } }));
vi.mock('./router', () => ({ router: { navigate: auth.navigate } }));
vi.mock('./WorkspaceShell', () => ({ default: () => <p>Authenticated workspace</p> }));
vi.mock('./components/CustomAuth', () => ({ default: ({ onAuthSuccess }: { onAuthSuccess: () => void }) =>
  <button onClick={onAuthSuccess}>Finish sign in</button> }));
vi.mock('./components/SiteBackground', () => ({ default: () => null }));
vi.mock('./components/SiteFooter', () => ({ default: () => null }));
vi.mock('./components/TextArrivalEffects', () => ({ default: () => null }));
vi.mock('./utils/brainHandoff', () => ({ beginBrainHandoff: () => false, cancelBrainHandoff: () => {} }));

it('preserves an authenticated deep link, but sends every fresh sign-in to Brain', async () => {
  const previousUrl = location.href;
  history.replaceState(null, '', '/quest/old-adventure');
  localStorage.setItem('lastActiveConversationId', 'old-adventure');
  localStorage.setItem('lastPersonalityMode', 'game_master');
  auth.getUser.mockResolvedValue({ userId: 'user-1' });
  const element = document.createElement('div') as HTMLDivElement & { __brainInCupRoot?: Root };
  element.id = 'root';
  document.body.append(element);
  try {
    await act(async () => { await import('./main'); });
    expect(await screen.findByText('Authenticated workspace')).toBeInTheDocument();
    expect(auth.navigate).not.toHaveBeenCalled();

    auth.getUser.mockRejectedValue(new Error('signed out'));
    act(() => auth.listener?.({ payload: { event: 'signedOut' } }));
    const finish = await screen.findByRole('button', { name: 'Finish sign in' });
    auth.getUser.mockResolvedValue({ userId: 'user-1' });
    await act(async () => { fireEvent.click(finish); });
    expect(await screen.findByText('Authenticated workspace')).toBeInTheDocument();
    expect(auth.navigate).toHaveBeenLastCalledWith({ to: '/brain/$conversationId', params: { conversationId: 'new' }, search: true, replace: true });
    expect(localStorage.getItem('lastActiveConversationId')).toBe('old-adventure');
    expect(sessionStorage.getItem('brain-in-cup:login-pending')).toBeNull();

    act(() => auth.listener?.({ payload: { event: 'signedOut' } }));
    await screen.findByRole('button', { name: 'Finish sign in' });
    await act(async () => { auth.listener?.({ payload: { event: 'signInWithRedirect' } }); });
    expect(await screen.findByText('Authenticated workspace')).toBeInTheDocument();
    expect(auth.navigate).toHaveBeenCalledTimes(2);
    expect(auth.navigate).toHaveBeenLastCalledWith({ to: '/brain/$conversationId', params: { conversationId: 'new' }, search: true, replace: true });
  } finally {
    act(() => element.__brainInCupRoot?.unmount());
    element.remove();
    localStorage.clear(); sessionStorage.clear();
    history.replaceState(null, '', previousUrl);
  }
});
