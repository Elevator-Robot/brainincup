// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalVoiceMiddleware } from './local-chat-voice';

let server: Server | undefined;
const realFetch = globalThis.fetch;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
});

async function start(apiKey = 'test-key') {
  server = createServer(createLocalVoiceMiddleware({ apiKey, voiceId: 'aaron-test' }));
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const options = (origin: string) => ({
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Brain-Voice': 'local' },
  body: JSON.stringify({ text: 'Hello from Aaron.' }),
});

it('returns uncached audio for a same-origin loopback request without exposing the key', async () => {
  const provider = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } }));
  vi.stubGlobal('fetch', provider);
  const origin = await start();
  const response = await realFetch(origin, options(origin));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  expect(provider).toHaveBeenCalledOnce();
  expect(provider.mock.calls[0]).toBeDefined();
});

it('rejects foreign origins, tunneled hosts, missing request markers, and preflights before synthesis', async () => {
  const provider = vi.fn();
  vi.stubGlobal('fetch', provider);
  const origin = await start();
  expect((await realFetch(origin, options('https://attacker.example'))).status).toBe(403);
  const tunneled = await new Promise<number | undefined>(resolve => {
    const request = httpRequest(origin, { method: 'POST', headers: { ...options(origin).headers, Host: 'public-tunnel.example' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.end(options(origin).body);
  });
  expect(tunneled).toBe(403);
  expect((await realFetch(origin, { ...options(origin), headers: { 'Content-Type': 'application/json' } })).status).toBe(403);
  expect((await realFetch(origin, { method: 'OPTIONS', headers: { Origin: origin } })).status).toBe(405);
  expect(provider).not.toHaveBeenCalled();
});

it('rejects malformed, oversized, and empty text without contacting the provider', async () => {
  const provider = vi.fn();
  vi.stubGlobal('fetch', provider);
  const origin = await start();
  for (const body of ['{', 'null', '{}', JSON.stringify({ text: 'x'.repeat(1001) })]) {
    expect((await realFetch(origin, { ...options(origin), body })).status).toBe(400);
  }
  expect((await realFetch(origin, { ...options(origin), body: 'x'.repeat(9000) })).status).toBe(413);
  expect(provider).not.toHaveBeenCalled();
});

it('reports a missing local key without contacting ElevenLabs', async () => {
  const provider = vi.fn();
  vi.stubGlobal('fetch', provider);
  const origin = await start('');
  expect((await realFetch(origin, options(origin))).status).toBe(503);
  expect(provider).not.toHaveBeenCalled();
});

it('hides provider response details', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private details and key', { status: 401 })));
  const origin = await start();
  const response = await realFetch(origin, options(origin));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('private details');
});
