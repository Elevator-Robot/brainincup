import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { queryClient } from './queries/queryClient';
import { router } from './router';

/** Authenticated workspace bootstrap. Loaded only after the auth gate passes. */
export default function WorkspaceShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
