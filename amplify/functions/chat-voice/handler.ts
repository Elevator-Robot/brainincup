import type { Schema } from '../../data/resource';

const API = 'https://api.elevenlabs.io';
let cachedVoice: { id: string; expires: number } | undefined;

async function resolveVoice(key: string, signal: AbortSignal): Promise<string> {
  const configured = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (configured) return configured;
  if (cachedVoice && cachedVoice.expires > Date.now()) return cachedVoice.id;
  const name = process.env.ELEVENLABS_VOICE_NAME || 'Aaron';
  const url = new URL(`${API}/v2/voices`);
  url.search = new URLSearchParams({ search: name, voice_type: 'non-community', page_size: '100' }).toString();
  const response = await fetch(url, { headers: { 'xi-api-key': key }, signal });
  if (!response.ok) throw new Error('Unable to find the configured ElevenLabs voice.');
  const data = await response.json() as { voices?: { name?: string; voice_id?: string }[]; has_more?: boolean };
  const matches = data.voices?.filter(voice => voice.name?.trim().toLowerCase() === name.toLowerCase() && voice.voice_id) ?? [];
  if (matches.length !== 1 || data.has_more) {
    throw new Error('Configure the unique Aaron voice ID on the server.');
  }
  cachedVoice = { id: matches[0].voice_id!, expires: Date.now() + 300_000 };
  return cachedVoice.id;
}

export const handler: Schema['generateChatSpeech']['functionHandler'] = async event => {
  // AppSync enforces user-pool authentication; never accept identity from input.
  if (!event.identity || !('sub' in event.identity) || !event.identity.sub) throw new Error('Sign in to use voice.');
  const text = event.arguments.text?.trim();
  if (!text || text.length > 1000) throw new Error('Speech requires 1–1000 characters.');
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Chat voice is not configured yet.');
  const signal = AbortSignal.timeout(25_000);
  const voice = await resolveVoice(key, signal);
  const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`, {
    method: 'POST', signal,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  // Never expose provider bodies, credentials, or submitted chat in errors/logs.
  if (!response.ok) throw new Error(response.status === 429 ? 'Voice is busy. Please try again shortly.' : 'Aaron’s voice is temporarily unavailable.');
  if (!response.headers.get('content-type')?.includes('audio/')) throw new Error('Voice returned an invalid audio format.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 700_000) throw new Error('Voice audio exceeded its delivery limit.');
  return { audio: Buffer.from(bytes).toString('base64'), contentType: 'audio/mpeg' };
};
