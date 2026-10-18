import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceBoundary from '../WorkspaceBoundary';
import WorkspaceLoading from '../WorkspaceLoading';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('workspace startup recovery', () => {
  it('offers recovery when loading never resolves', () => {
    vi.useFakeTimers();
    render(<WorkspaceLoading />);
    expect(screen.getByText('Loading workspace…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeInTheDocument();
    expect(screen.getByText('The workspace is taking longer than expected.')).toBeInTheDocument();
  });

  it('shows immediate recovery for a failed workspace render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenWorkspace(): never {
      throw new Error('Failed to fetch dynamically imported module');
    }
    render(<WorkspaceBoundary><BrokenWorkspace /></WorkspaceBoundary>);
    expect(screen.getByText('The workspace could not load.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload workspace' })).toBeInTheDocument();
  });
});
