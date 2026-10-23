import { QueryClient } from '@tanstack/react-query';

/**
 * Workspace data cache. Query data is the authoritative copy for the current
 * session; components render it directly instead of mirroring it into
 * component state, which is what kept producing placeholder states on load.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
