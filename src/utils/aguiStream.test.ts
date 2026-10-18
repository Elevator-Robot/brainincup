import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAgentMessage, type AguiEvent } from './aguiStream';

const parameters = { conversationId: 'conversation', messageId: 'message', owner: 'local-user', content: 'Hello' };
const outputsWindow = window as unknown as { __AMPLIFY_OUTPUTS__?: { custom: { brainApiUrl: string } } };

afterEach(() => { vi.unstubAllGlobals(); delete outputsWindow.__AMPLIFY_OUTPUTS__; });

describe('stream transport', () => {
  it('preserves UTF-8 and event order across split network chunks and cancels on DONE', async () => {
    outputsWindow.__AMPLIFY_OUTPUTS__ = { custom: { brainApiUrl: 'https://local.invalid/stream' } };
    const cancel = vi.fn();
    const events: AguiEvent[] = [];
    const wire = [
      'data: {malformed}\n\n',
      ...[
        { type: 'TEXT_MESSAGE_START', messageId: 'reply' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta: 'Hello ' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta: '世界 ✨' },
        { type: 'TEXT_MESSAGE_END', messageId: 'reply' },
      ].map(event => `data: ${JSON.stringify(event)}\n\n`),
      'data: [DONE]\n\n',
    ].join('');
    const bytes = new TextEncoder().encode(wire);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await streamAgentMessage({ ...parameters, onEvent: event => events.push(event) });
    expect(events).toEqual([
      { type: 'TEXT_MESSAGE_START', messageId: 'reply' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta: 'Hello 世界 ✨' },
      { type: 'TEXT_MESSAGE_END', messageId: 'reply' },
    ]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
  });

  it('flushes pending text when the connection closes without a DONE marker', async () => {
    outputsWindow.__AMPLIFY_OUTPUTS__ = { custom: { brainApiUrl: 'https://local.invalid/stream' } };
    const event = { type: 'TEXT_MESSAGE_CONTENT', messageId: 'reply', delta: 'The final words.' };
    const receive = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify(event)}\n\n`)));
    await streamAgentMessage({ ...parameters, onEvent: receive });
    expect(receive).toHaveBeenCalledExactlyOnceWith(event);
  });
});
