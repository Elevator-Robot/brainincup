import type { IncomingMessage, ServerResponse } from 'node:http';
import { createVoiceService, type VoiceConfig } from '../amplify/functions/chat-voice/service';

export function createLocalVoiceMiddleware(config: VoiceConfig) {
  const synthesize = createVoiceService(config);
  let busy = false;
  let recent: number[] = [];

  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status: number, error: string) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error }));
    };
    // The demo binds all interfaces. This paid route must NOT be usable from
    // LAN devices, tunnels, DNS rebinding, or foreign-origin browser requests.
    const remote = request.socket.remoteAddress;
    const host = request.headers.host ?? '';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (!loopback || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
      || (request.headers.origin && request.headers.origin !== `http://${host}`)
      || request.headers['sec-fetch-site'] === 'cross-site') {
      fail(403, 'Local voice is available only on localhost.'); return;
    }
    if (request.method !== 'POST') { fail(405, 'Use POST.'); return; }
    if (request.headers['x-brain-voice'] !== 'local' || request.headers['content-type'] !== 'application/json') {
      fail(403, 'Use the local chat voice control.'); return;
    }
    if (!config.apiKey) { fail(503, 'Set ELEVENLABS_API_KEY in .env, then restart the demo.'); return; }
    if (busy) { fail(429, 'Voice is busy. Please try again.'); return; }
    recent = recent.filter(time => time > Date.now() - 60_000);
    if (recent.length >= 30) { fail(429, 'Local voice limit reached. Wait one minute.'); return; }
    busy = true;
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    response.on('close', abort);
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        length += Buffer.byteLength(chunk);
        if (length > 8000) { fail(413, 'Speech request is too large.'); return; }
        chunks.push(Buffer.from(chunk));
      }
      let body: { text?: unknown };
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { fail(400, 'Speech requires valid JSON.'); return; }
      if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 1000) {
        fail(400, 'Speech requires 1–1000 characters.'); return;
      }
      recent.push(Date.now());
      const packet = await synthesize(body.text, controller.signal);
      if (controller.signal.aborted) return;
      const encoded = JSON.stringify(packet);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) });
      response.end(encoded);
    } catch {
      if (!controller.signal.aborted && !response.headersSent) fail(502, 'Brain’s voice is unavailable. Check the voice ID, key’s TTS permissions, and credit balance.');
    } finally {
      response.removeListener('close', abort);
      busy = false;
    }
  };
}
