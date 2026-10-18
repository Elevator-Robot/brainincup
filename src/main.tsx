import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getCurrentUser } from 'aws-amplify/auth';
// Complete redirect sign-in before the auth gate waits for getCurrentUser().
// CustomAuth is lazy-loaded, so its signInWithRedirect import arrives too late.
import 'aws-amplify/auth/enable-oauth-listener';
import SiteBackground from './components/SiteBackground';
import WorkspaceLoading from './components/WorkspaceLoading';
import WorkspaceBoundary from './components/WorkspaceBoundary';
import TextArrivalEffects from './components/TextArrivalEffects';
import { isTestModeEnabled } from './utils/testMode';
import './index.css';
import './cosmic-theme.css';
import '@fontsource/cinzel/latin-700.css';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import { Hub } from 'aws-amplify/utils';

const App = React.lazy(() => import('./App'));
const CustomAuth = React.lazy(() => import('./components/CustomAuth'));

(window as unknown as { __AMPLIFY_OUTPUTS__: typeof outputs }).__AMPLIFY_OUTPUTS__ = outputs;
Amplify.configure(outputs);

// Entry file intentionally hosts auth gate + app mount.
// eslint-disable-next-line react-refresh/only-export-components
function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const checkAuthState = useCallback(async () => {
    try {
      if (isTestModeEnabled()) {
        setIsAuthenticated(true);
        return;
      }
      await getCurrentUser();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuthState();
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') void checkAuthState();
      if (payload.event === 'signedOut') setIsAuthenticated(false);
    });
    const params = new URLSearchParams(window.location.search);
    const retry = params.has('code') || params.has('state')
      ? window.setTimeout(checkAuthState, 1000)
      : undefined;
    return () => { unsubscribe(); window.clearTimeout(retry); };
  }, [checkAuthState]);

  return <>
    <SiteBackground />
    <WorkspaceBoundary>
      <React.Suspense fallback={<WorkspaceLoading />}>
        {isLoading ? <WorkspaceLoading /> : isAuthenticated ? <App /> : <CustomAuth onAuthSuccess={checkAuthState} />}
      </React.Suspense>
    </WorkspaceBoundary>
  </>;
}

interface RootElementWithCache extends HTMLElement {
  __brainInCupRoot?: Root;
}

const ConversationPreview = import.meta.env.DEV
  ? React.lazy(() => import('./dev/ConversationPreview'))
  : null;
const DicePreview = import.meta.env.DEV
  ? React.lazy(() => import('./dev/DicePreview'))
  : null;

const rootElement = document.getElementById('root') as RootElementWithCache | null;

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = rootElement.__brainInCupRoot ?? createRoot(rootElement);
rootElement.__brainInCupRoot = root;

root.render(
  <React.StrictMode>
    <TextArrivalEffects />
    {DicePreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'dice'
      ? <React.Suspense fallback={<WorkspaceLoading />}><DicePreview /></React.Suspense>
      : ConversationPreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'conversation'
        ? <React.Suspense fallback={<WorkspaceLoading />}><ConversationPreview /></React.Suspense>
        : <AuthWrapper />}
  </React.StrictMode>,
);
