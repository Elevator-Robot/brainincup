/* eslint-disable react-refresh/only-export-components -- the router instance and its route components share this module by design */
import { Suspense, lazy, useCallback } from 'react';
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import WorkspaceRecovery from './components/WorkspaceRecovery';
import { isTestModeEnabled } from './utils/testMode';
import type { PersonalityModeId } from './constants/personalityModes';

const App = lazy(() => import('./App'));

interface WorkspaceRouteProps {
  mode: PersonalityModeId;
}

/**
 * Workspace shell. The route carries the conversation that is open, so a
 * refresh, a shared link, or back/forward restores the same interaction
 * instead of depending on localStorage alone.
 */
function WorkspaceRoute({ mode }: WorkspaceRouteProps) {
  const { conversationId } = useParams({ strict: false }) as { conversationId: string };
  const navigate = useNavigate();
  const routeConversationId = conversationId === 'new' ? null : conversationId;

  const handleRouteChange = useCallback(
    ({ conversationId: nextConversationId, mode: nextMode }: { conversationId: string | null; mode: PersonalityModeId }) => {
      const params = { conversationId: nextConversationId ?? 'new' };
      if (nextMode === 'brain') {
        void navigate({ to: '/brain/$conversationId', params, search: true, replace: true });
        return;
      }
      void navigate({ to: '/quest/$conversationId', params, search: true, replace: true });
    },
    [navigate],
  );

  return (
    <Suspense fallback={<WorkspaceRecovery />}>
      <App
        routeConversationId={routeConversationId}
        routeMode={mode}
        onRouteChange={handleRouteChange}
      />
    </Suspense>
  );
}

const rootRoute = createRootRoute({ component: Outlet });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async () => {
    if (isTestModeEnabled() && import.meta.env.DEV) {
      const demo = await import('./dev/gmDemoConversation');
      throw redirect({
        to: '/quest/$conversationId',
        params: { conversationId: demo.DEMO_CONVERSATION_ID },
        search: true,
        replace: true,
      });
    }
    const lastConversationId = localStorage.getItem('lastActiveConversationId') ?? 'new';
    const mode = localStorage.getItem('lastPersonalityMode') === 'brain' ? 'brain' : 'game_master';
    throw redirect({
      to: mode === 'brain' ? '/brain/$conversationId' : '/quest/$conversationId',
      params: { conversationId: lastConversationId },
      search: true,
      replace: true,
    });
  },
  component: () => null,
});

const questRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quest/$conversationId',
  component: () => <WorkspaceRoute mode="game_master" />,
});

const brainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brain/$conversationId',
  component: () => <WorkspaceRoute mode="brain" />,
});

const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  loader: () => {
    throw redirect({ to: '/', search: true, replace: true });
  },
  component: () => null,
});

const routeTree = rootRoute.addChildren([indexRoute, questRoute, brainRoute, catchAllRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: false,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
