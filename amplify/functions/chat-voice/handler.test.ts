// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Schema } from '../../data/resource';

type Input = Parameters<Schema['generateChatSpeech']['functionHandler']>[0];
const input = (text = 'Hello friend.') => ({ arguments: { text }, identity: { sub: 'user-1' } }) as Input;
const request = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
  vi.stubEnv('ELEVENLABS_VOICE_ID', '');
  vi.stubGlobal('fetch', request);
  request.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('requires authenticated identity and bounded input before contacting ElevenLabs', async () => {
  const { handler } = await import('./handler');
  await expect(handler({ ...input(), identity: null } as Input, {} as never, () => {})).rejects.toThrow('Sign in');
  await expect(handler(input('x'.repeat(1001)), {} as never, () => {})).rejects.toThrow('1000');
  expect(request).not.toHaveBeenCalled();
});

it('discovers only the exact personal Aaron voice, generates MP3, and reuses discovery', async () => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({ voices: [{ name: 'Aaron', voice_id: 'aaron-id' }, { name: 'Aaron other', voice_id: 'wrong' }], has_more: false })))
    .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } }));
  const { handler } = await import('./handler');
  const result = await handler(input(), {} as never, () => {});
  expect(result).toEqual({ audio: 'AQID', contentType: 'audio/mpeg' });
  const discovery = request.mock.calls[0][0] as URL;
  expect(discovery.searchParams.get('voice_type')).toBe('non-community');
  expect(discovery.searchParams.get('search')).toBe('Aaron');
  expect(request.mock.calls[1][0]).toContain('/aaron-id?output_format=mp3_22050_32');
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ text: 'Hello friend.', model_id: 'eleven_flash_v2_5' });
  await handler(input('Another reply'), {} as never, () => {});
  expect(request).toHaveBeenCalledTimes(3);
});

it('rejects ambiguous voice names instead of substituting another voice', async () => {
  request.mockResolvedValue(new Response(JSON.stringify({ voices: [{ name: 'Aaron', voice_id: 'one' }, { name: 'Aaron', voice_id: 'two' }] })));
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('unique Aaron voice ID');
  expect(request).toHaveBeenCalledOnce();
});

it('uses a configured stable voice ID and does not expose provider failure details', async () => {
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'my-aaron');
  request.mockResolvedValue(new Response('sensitive provider details', { status: 401 }));
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('temporarily unavailable');
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toContain('/my-aaron?');
});

it('rejects non-audio provider output', async () => {
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'my-aaron');
  request.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('invalid audio format');
});
