import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { StreamAgentParams } from './utils/aguiStream';

const api = vi.hoisted(() => ({
  reset: vi.fn(async (payload: { id: string; brainState: null; brainStateVersion: string }) => ({ data: payload })),
  deleteResponse: vi.fn(async () => ({ data: null })),
  deleteMessage: vi.fn(async () => ({ data: null })),
  updateMessage: vi.fn(), stream: vi.fn(),
  messages: [{ id: 'm1', content: 'Remember this exchange.', timestamp: '2026-01-01T00:00:00Z' }],
}));
vi.mock('aws-amplify/auth', () => ({ fetchUserAttributes: async () => ({ sub: 'user-1', email: 'test@example.invalid' }), signOut: vi.fn() }));
vi.mock('./api/dataClient', () => ({ dataClient: {
  models: {
    Conversation: {
      list: async () => ({ data: [{ id: 'account-brain', experience: 'brain', personalityMode: 'brain' }] }),
      get: async () => ({ data: { id: 'account-brain', experience: 'brain', personalityMode: 'brain' } }),
      update: api.reset,
    },
    Message: {
      list: async ({ nextToken }: { nextToken?: string | null } = {}) => ({
        data: nextToken ? api.messages.slice(1) : api.messages.slice(0, 1),
        nextToken: !nextToken && api.messages.length > 1 ? 'message-page-2' : null,
      }), delete: api.deleteMessage, update: api.updateMessage,
      create: async ({ content }: { content: string }) => {
        const message = { id: 'm2', content, timestamp: '2026-01-02T00:00:00Z' };
        api.messages.push(message); return { data: message };
      },
    },
    BrainResponse: { list: async ({ nextToken }: { nextToken?: string | null } = {}) => ({
      data: nextToken ? [{ id: 'r2', messageId: 'm0', response: 'An older reply.' }] : [{ id: 'r1', messageId: 'm1', response: 'An earlier reply.' }],
      nextToken: api.reset.mock.calls.length && !nextToken ? 'response-page-2' : null,
    }), delete: api.deleteResponse },
  },
  graphql: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
} }));
vi.mock('./utils/aguiStream', () => ({ streamAgentMessage: api.stream }));
vi.mock('./components/ConversationSidebarIcons', () => ({ default: () => <nav aria-label="Global menu" /> }));
vi.mock('./hooks/useChatScroll', () => ({ useChatScroll: () => ({ scrollRef: { current: null }, contentRef: { current: null }, isAtBottom: true, scrollToLatest() {} }) }));

it('aborts inference, resets durable Brain state before deleting chat, and ignores late stream events', async () => {
  const previous = location.href;
  history.replaceState(null, '', '/brain/account-brain');
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width') || query.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }));
  let active: StreamAgentParams | undefined;
  api.stream.mockImplementation((params: StreamAgentParams) => {
    active = params;
    return new Promise((_resolve, reject) => params.signal!.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
  });
  const { default: WorkspaceShell } = await import('./WorkspaceShell');
  const { queryClient } = await import('./queries/queryClient');
  try {
    render(<WorkspaceShell />);
    await screen.findByText('An earlier reply.', {}, { timeout: 5000 });
    api.reset.mockResolvedValueOnce({ data: { id: 'account-brain', brainState: null, brainStateVersion: 'unverified-old-revision' } });
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify that Brain’s memory was reset');
    expect(api.deleteMessage).not.toHaveBeenCalled();
    expect(api.deleteResponse).not.toHaveBeenCalled();
    expect(screen.getByText('An earlier reply.')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Start another response.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(api.stream).toHaveBeenCalledTimes(1));
    let finishReset: (() => void) | undefined;
    api.reset.mockImplementationOnce(payload => new Promise(resolve => {
      finishReset = () => resolve({ data: payload });
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear chat' }));
    await waitFor(() => expect(api.reset).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getByRole('button', { name: 'Clear chat' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    await act(async () => { finishReset?.(); });
    await waitFor(() => expect(screen.queryByText('An earlier reply.')).toBeNull());
    expect(active?.signal?.aborted).toBe(true);
    expect(api.reset).toHaveBeenCalledWith({ id: 'account-brain', brainState: null, brainStateVersion: expect.any(String) }, {
      selectionSet: ['id', 'brainState', 'brainStateVersion'], authMode: 'userPool',
    });
    expect(api.reset.mock.invocationCallOrder[0]).toBeLessThan(api.deleteResponse.mock.invocationCallOrder[0]);
    expect(api.reset.mock.invocationCallOrder[0]).toBeLessThan(api.deleteMessage.mock.invocationCallOrder[0]);
    expect(api.updateMessage).not.toHaveBeenCalled();
    expect(api.deleteMessage).toHaveBeenCalledTimes(2);
    expect(api.deleteResponse).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => {
      active?.onEvent({ type: 'TEXT_MESSAGE_START', messageId: 'late' });
      active?.onEvent({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'late', delta: 'This must stay cleared.' });
    });
    expect(screen.queryByText('This must stay cleared.')).toBeNull();
  } finally {
    cleanup(); queryClient.clear(); vi.unstubAllGlobals();
    localStorage.clear(); sessionStorage.clear(); history.replaceState(null, '', previous);
  }
}, 10_000);
