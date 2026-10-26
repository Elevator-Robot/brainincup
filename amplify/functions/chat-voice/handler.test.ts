// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Schema } from '../../data/resource';

type Input = Parameters<Schema['generateChatSpeech']['functionHandler']>[0];
const input = (text = 'Hello friend.') => ({ arguments: { text }, identity: { sub: 'user-1' } }) as Input;
const request = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('ELEVENLABS_API_KEY', 'test-key');
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'brain-voice-id');
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

it('uses Brain’s configured voice ID without any voice-name lookup', async () => {
  request.mockImplementation(async () => new Response(JSON.stringify({ audio_base64: 'AQID' }), { headers: { 'Content-Type': 'application/json' } }));
  const { handler } = await import('./handler');
  const result = await handler(input(), {} as never, () => {});
  expect(result).toEqual({ audio: 'AQID', contentType: 'audio/mpeg', alignment: null });
  expect(request.mock.calls[0][0]).toContain('/brain-voice-id/with-timestamps?output_format=mp3_22050_32');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ text: 'Hello friend.', model_id: 'eleven_flash_v2_5' });
  await handler(input('Another reply'), {} as never, () => {});
  expect(request).toHaveBeenCalledTimes(2);
});

it('requires Brain’s voice ID instead of choosing an arbitrary provider voice', async () => {
  vi.stubEnv('ELEVENLABS_VOICE_ID', '');
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('ELEVENLABS_VOICE_ID for Brain');
  expect(request).not.toHaveBeenCalled();
});

it('uses a configured stable voice ID and does not expose provider failure details', async () => {
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'brain-voice-id');
  request.mockResolvedValue(new Response('sensitive provider details', { status: 401 }));
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('temporarily unavailable');
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toContain('/brain-voice-id/with-timestamps?');
});

it('rejects non-audio provider output', async () => {
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'brain-voice-id');
  request.mockResolvedValue(new Response('not audio', { headers: { 'Content-Type': 'text/plain' } }));
  const { handler } = await import('./handler');
  await expect(handler(input(), {} as never, () => {})).rejects.toThrow('invalid audio format');
});

it('returns provider character alignment alongside audio and drops mismatched timing', async () => {
  request.mockResolvedValueOnce(new Response(JSON.stringify({ audio_base64: 'AQID', alignment: {
    characters: ['H', 'i'], character_start_times_seconds: [0, .2], character_end_times_seconds: [.2, .4],
  } }), { headers: { 'Content-Type': 'application/json' } }));
  const { handler } = await import('./handler');
  expect(await handler(input('Hi'), {} as never, () => {})).toEqual({ audio: 'AQID', contentType: 'audio/mpeg', alignment: { characters: ['H', 'i'], startTimes: [0, .2], endTimes: [.2, .4] } });
  request.mockResolvedValueOnce(new Response(JSON.stringify({ audio_base64: 'AQID', alignment: {
    characters: ['N', 'o'], character_start_times_seconds: [0, .2], character_end_times_seconds: [.2, .4],
  } }), { headers: { 'Content-Type': 'application/json' } }));
  expect(await handler(input('Hi'), {} as never, () => {})).toMatchObject({ alignment: null });
});

it('does not expose malformed provider JSON in error messages', async () => {
  request.mockResolvedValueOnce(new Response('private-provider-fragment', { headers: { 'Content-Type': 'application/json' } }));
  const { handler } = await import('./handler');
  await expect(handler(input('Hi'), {} as never, () => {})).rejects.toThrow('Voice returned an invalid audio format.');
});
