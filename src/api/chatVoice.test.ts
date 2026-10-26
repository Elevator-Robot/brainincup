import { afterEach, expect, it, vi } from 'vitest';
import { generateChatSpeech } from './chatVoice';

const api = vi.hoisted(() => ({ generate: vi.fn(), cancel: vi.fn() }));
vi.mock('./dataClient', () => ({ dataClient: { mutations: { generateChatSpeech: api.generate }, cancel: api.cancel } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

const alignment = { characters: ['H', 'i'], startTimes: [0, .2], endTimes: [.2, .4] };
it('decodes local audio and original-text timestamps without exposing provider credentials', async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ audio: 'AQID', contentType: 'audio/mpeg', alignment }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', request);
  const result = await generateChatSpeech('Hi', new AbortController().signal);
  expect(result.blob.type).toBe('audio/mpeg');
  expect(result.alignment).toEqual(alignment);
  expect(request).toHaveBeenCalledWith('/__local/chat-voice', expect.objectContaining({ headers: { 'Content-Type': 'application/json', 'X-Brain-Voice': 'local' } }));
});
it('drops mismatched timestamps instead of pretending normalized text is synchronized', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ audio: 'AQID', contentType: 'audio/mpeg', alignment }), { headers: { 'Content-Type': 'application/json' } })));
  expect((await generateChatSpeech('Hello', new AbortController().signal)).alignment).toBeNull();
});
it('supports audio-only legacy local responses without fabricated timing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } })));
  const result = await generateChatSpeech('Hi', new AbortController().signal);
  expect(result.blob.type).toBe('audio/mpeg'); expect(result.alignment).toBeNull();
});
it('does not send a request after cancellation', async () => {
  const request = vi.fn(); vi.stubGlobal('fetch', request);
  const controller = new AbortController(); controller.abort();
  await expect(generateChatSpeech('Hi', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(request).not.toHaveBeenCalled();
});
it('decodes the same timing contract from the authenticated production mutation', async () => {
  vi.stubEnv('DEV', false);
  api.generate.mockResolvedValueOnce({ data: { audio: 'AQID', contentType: 'audio/mpeg', alignment } });
  const result = await generateChatSpeech('Hi', new AbortController().signal);
  expect(api.generate).toHaveBeenCalledWith({ text: 'Hi' });
  expect(result.alignment).toEqual(alignment);
});
