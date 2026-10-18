import { act, screen } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../amplify_outputs.json', () => ({
  default: {
    version: '1.3',
    auth: {
      aws_region: 'us-east-1',
      user_pool_id: 'us-east-1_test',
      user_pool_client_id: 'redirect-test',
      oauth: {
        domain: 'unused.example.com',
        scopes: ['openid'],
        redirect_sign_in_uri: [`${window.location.origin}/`],
        redirect_sign_out_uri: [`${window.location.origin}/`],
        response_type: 'code',
      },
    },
  },
}));

// Neither lazy screen imports Amplify's OAuth listener: startup must load it.
vi.mock('./components/CustomAuth', () => ({ default: () => <p>Sign-in screen ready</p> }));
vi.mock('./App', () => ({ default: () => <p>Workspace ready</p> }));
vi.mock('./components/SiteBackground', () => ({ default: () => null }));

it('settles an in-flight OAuth redirect before loading the lazy sign-in screen', async () => {
  const originalUrl = window.location.href;
  window.history.replaceState(null, '', '/?error=access_denied&error_description=cancelled');
  window.localStorage.setItem('CognitoIdentityServiceProvider.redirect-test.inflightOAuth', 'true');
  const element = document.createElement('div') as HTMLDivElement & { __brainInCupRoot?: Root };
  element.id = 'root';
  document.body.appendChild(element);
  try {
    await act(async () => { await import('./main'); });
    expect(await screen.findByText('Sign-in screen ready')).toBeInTheDocument();
    expect(screen.queryByText('Loading workspace…')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('CognitoIdentityServiceProvider.redirect-test.inflightOAuth')).toBeNull();
  } finally {
    act(() => element.__brainInCupRoot?.unmount());
    element.remove();
    window.localStorage.clear();
    window.history.replaceState(null, '', originalUrl);
  }
});
