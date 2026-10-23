import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import BrainArrivalPreview from './BrainArrivalPreview';

const navigation = vi.hoisted(() => vi.fn());
vi.mock('../router', () => ({ router: { navigate: navigation } }));
vi.mock('../components/CustomAuth', () => ({ AuthModal: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div> }));
vi.mock('../components/SiteBackground', () => ({ default: () => null }));
vi.mock('../WorkspaceShell', () => ({ default: () => <p>Demo workspace mounted</p> }));
vi.mock('../utils/brainHandoff', () => ({ beginBrainHandoff: () => false, cancelBrainHandoff: () => {} }));

afterEach(() => { cleanup(); navigation.mockReset(); history.replaceState(null, '', '/'); });

it('opens Brain before mounting the demo, including a login replay from a GM session', async () => {
  history.replaceState(null, '', '/quest/last-adventure?testmode=true&preview=brain');
  let finish!: () => void;
  navigation.mockImplementation(() => new Promise<void>(resolve => {
    finish = () => { history.replaceState(null, '', '/brain/new?testmode=true&preview=brain'); resolve(); };
  }));
  render(<BrainArrivalPreview />);
  fireEvent.click(screen.getByRole('button', { name: /Enter Brain chat/ }));
  expect(navigation).toHaveBeenCalledExactlyOnceWith({ to: '/brain/$conversationId', params: { conversationId: 'new' }, search: true, replace: true });
  expect(screen.queryByText('Demo workspace mounted')).toBeNull();
  expect(screen.getByRole('button', { name: /Opening Brain/ })).toBeDisabled();
  await act(async () => { finish(); });
  expect(screen.getByText('Demo workspace mounted')).toBeInTheDocument();

  history.replaceState(null, '', '/quest/last-adventure?testmode=true&preview=brain');
  fireEvent.click(screen.getByRole('button', { name: /Replay arrival/ }));
  expect(screen.getByText('Demo workspace mounted')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Enter Brain chat/ }));
  expect(navigation).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Demo workspace mounted')).not.toBeVisible();
  await act(async () => { finish(); });
  expect(location.pathname).toBe('/brain/new');
  expect(screen.getByText('Demo workspace mounted')).toBeVisible();
});

it('keeps the login preview open if Brain navigation fails and allows retry', async () => {
  navigation.mockRejectedValueOnce(new Error('chunk unavailable')).mockResolvedValue(undefined);
  render(<BrainArrivalPreview />);
  fireEvent.click(screen.getByRole('button', { name: /Enter Brain chat/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to open Brain');
  expect(screen.queryByText('Demo workspace mounted')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Enter Brain chat/ }));
  await waitFor(() => expect(screen.getByText('Demo workspace mounted')).toBeInTheDocument());
});
