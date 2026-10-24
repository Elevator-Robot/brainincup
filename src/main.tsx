import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
// Capture a cold OAuth return before Amplify consumes/cleans its callback URL.
import { consumeBrainLogin, rememberBrainLogin } from './utils/loginLanding';
import { getCurrentUser } from 'aws-amplify/auth';
// Complete redirect sign-in before the auth gate waits for getCurrentUser().
// CustomAuth is lazy-loaded, so its signInWithRedirect import arrives too late.
import 'aws-amplify/auth/enable-oauth-listener';
import SiteBackground from './components/SiteBackground';
import WorkspaceRecovery from './components/WorkspaceRecovery';
import WorkspaceBoundary from './components/WorkspaceBoundary';
import TextArrivalEffects from './components/TextArrivalEffects';
import SiteFooter from './components/SiteFooter';
import { isTestModeEnabled } from './utils/testMode';
import { beginBrainHandoff, cancelBrainHandoff } from './utils/brainHandoff';
import './index.css';
import './cosmic-theme.css';
import '@fontsource/cinzel/latin-700.css';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import { Hub } from 'aws-amplify/utils';

const loadWorkspaceShell = () => import('./WorkspaceShell');
const loadAuth = () => import('./components/CustomAuth');
const WorkspaceShell = React.lazy(loadWorkspaceShell);
const CustomAuth = React.lazy(loadAuth);

(window as unknown as { __AMPLIFY_OUTPUTS__: typeof outputs }).__AMPLIFY_OUTPUTS__ = outputs;
Amplify.configure(outputs);
// Fetch both entry chunks while authentication settles, avoiding a second wait
// after sign-in. This imports UI code; authenticated data effects mount later.
void loadWorkspaceShell().catch(error => console.warn('Workspace preload failed:', error));
void loadAuth().catch(error => console.warn('Sign-in preload failed:', error));

// Entry file intentionally hosts auth gate + app mount.
// eslint-disable-next-line react-refresh/only-export-components
function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authDeparting, setAuthDeparting] = useState(false);
  const authenticatedRef = useRef(false);
  const loginRequiredRef = useRef(false);
  const authCheckRef = useRef<Promise<void> | null>(null);
  const authVersionRef = useRef(0);
  const departureTimer = useRef<number>();
  const checkAuthState = useCallback(() => {
    // StrictMode, Hub and Authenticator may all check at once. They must share
    // the entire gate, including navigation, not race to consume login intent.
    if (authCheckRef.current) return authCheckRef.current;
    const version = authVersionRef.current;
    const request = (async () => {
      try {
        if (!isTestModeEnabled()) await getCurrentUser();
        if (version !== authVersionRef.current) return;
        if (!authenticatedRef.current || loginRequiredRef.current) {
          if (!isTestModeEnabled()) {
            const pendingLogin = consumeBrainLogin();
            if (loginRequiredRef.current || pendingLogin) {
              const { router } = await import('./router');
              await router.navigate({ to: '/brain/$conversationId', params: { conversationId: 'new' }, search: true, replace: true });
            }
          }
          if (version !== authVersionRef.current) return;
          loginRequiredRef.current = false;
          const fromLogin = Boolean(document.querySelector('[data-brain-login]'));
          if (beginBrainHandoff() && fromLogin) {
            setAuthDeparting(true);
            departureTimer.current = window.setTimeout(() => setAuthDeparting(false), 300);
          }
        }
        authenticatedRef.current = true;
        setIsAuthenticated(true);
      } catch {
        if (version !== authVersionRef.current) return;
        authenticatedRef.current = false;
        loginRequiredRef.current = true;
        rememberBrainLogin();
        cancelBrainHandoff();
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    })();
    authCheckRef.current = request;
    void request.then(() => { if (authCheckRef.current === request) authCheckRef.current = null; });
    return request;
  }, []);

  const completeSignIn = useCallback(async () => {
    if (authenticatedRef.current) return;
    loginRequiredRef.current = true;
    await checkAuthState();
    // A sign-in event may arrive while an earlier signed-out check is finishing.
    if (loginRequiredRef.current) await checkAuthState();
  }, [checkAuthState]);

  useEffect(() => {
    void checkAuthState();
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signInWithRedirect') {
        // Brain is the sign-in destination, not an ongoing navigation lock.
        // A late/duplicate Hub notification must not pull an active GM session
        // or an unfinished character draft back to Brain.
        if (!authenticatedRef.current) void completeSignIn();
      }
      if (payload.event === 'signedOut') {
        authVersionRef.current += 1;
        authenticatedRef.current = false;
        loginRequiredRef.current = true;
        rememberBrainLogin();
        window.clearTimeout(departureTimer.current);
        setAuthDeparting(false);
        cancelBrainHandoff();
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    });
    const params = new URLSearchParams(window.location.search);
    const retry = params.has('code') || params.has('state')
      ? window.setTimeout(checkAuthState, 1000)
      : undefined;
    return () => { unsubscribe(); window.clearTimeout(retry); window.clearTimeout(departureTimer.current); cancelBrainHandoff(); };
  }, [checkAuthState, completeSignIn]);

  return <>
    <SiteBackground />
    <WorkspaceBoundary>
      {isLoading ? <WorkspaceRecovery /> : <>
        {isAuthenticated && <React.Suspense fallback={<WorkspaceRecovery />}><WorkspaceShell /></React.Suspense>}
        {(!isAuthenticated || authDeparting) && <React.Suspense fallback={<WorkspaceRecovery />}>
          <div className={authDeparting ? 'cosmic-auth-departing' : undefined} aria-hidden={authDeparting || undefined}>
            <CustomAuth onAuthSuccess={completeSignIn} />
          </div>
        </React.Suspense>}
      </>}
    </WorkspaceBoundary>
    {(isLoading || isAuthenticated) && <SiteFooter />}
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
const GameMasterPreview = import.meta.env.DEV
  ? React.lazy(() => import('./dev/GameMasterPreview'))
  : null;
const BrainArrivalPreview = import.meta.env.DEV
  ? React.lazy(() => import('./dev/BrainArrivalPreview'))
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
    {BrainArrivalPreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'brain'
      ? <React.Suspense fallback={<WorkspaceRecovery />}><BrainArrivalPreview /></React.Suspense>
      : GameMasterPreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'gm'
        ? <React.Suspense fallback={<WorkspaceRecovery />}><GameMasterPreview /></React.Suspense>
        : DicePreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'dice'
          ? <React.Suspense fallback={<WorkspaceRecovery />}><DicePreview /></React.Suspense>
          : ConversationPreview && isTestModeEnabled() && new URLSearchParams(window.location.search).get('preview') === 'conversation'
            ? <React.Suspense fallback={<WorkspaceRecovery />}><ConversationPreview /></React.Suspense>
            : <AuthWrapper />}
    {isTestModeEnabled() && ['gm', 'dice', 'conversation', 'brain'].includes(new URLSearchParams(window.location.search).get('preview') || '') && <SiteFooter />}
  </React.StrictMode>,
);
