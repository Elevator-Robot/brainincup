/** Server-only ElevenLabs transport, shared by Lambda and the local dev proxy. */
export interface VoiceConfig { apiKey: string; voiceId?: string; voiceName?: string }

export function createVoiceService(config: VoiceConfig) {
  const API = 'https://api.elevenlabs.io';
  let cachedVoice: { id: string; expires: number } | undefined;

  async function resolveVoice(signal: AbortSignal): Promise<string> {
    if (config.voiceId?.trim()) return config.voiceId.trim();
    if (cachedVoice && cachedVoice.expires > Date.now()) return cachedVoice.id;
    const name = config.voiceName || 'Aaron';
    const url = new URL(`${API}/v2/voices`);
    url.search = new URLSearchParams({ search: name, voice_type: 'non-community', page_size: '100' }).toString();
    const response = await fetch(url, { headers: { 'xi-api-key': config.apiKey }, signal });
    if (!response.ok) throw new Error('Unable to find the configured ElevenLabs voice.');
    const data = await response.json() as { voices?: { name?: string; voice_id?: string }[]; has_more?: boolean };
    const matches = data.voices?.filter(voice => voice.name?.trim().toLowerCase() === name.toLowerCase() && voice.voice_id) ?? [];
    if (matches.length !== 1 || data.has_more) throw new Error('Configure the unique Aaron voice ID on the server.');
    cachedVoice = { id: matches[0].voice_id!, expires: Date.now() + 300_000 };
    return cachedVoice.id;
  }

  return async (input: string, parentSignal?: AbortSignal): Promise<Uint8Array> => {
    const text = typeof input === 'string' ? input.trim() : '';
    if (!text || text.length > 1000) throw new Error('Speech requires 1–1000 characters.');
    if (!config.apiKey) throw new Error('Chat voice is not configured yet.');
    const timeout = AbortSignal.timeout(25_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    const voice = await resolveVoice(signal);
    const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`, {
      method: 'POST', signal,
      headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Voice is busy. Please try again shortly.' : 'Aaron’s voice is temporarily unavailable.');
    if (!response.headers.get('content-type')?.includes('audio/')) throw new Error('Voice returned an invalid audio format.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 700_000) throw new Error('Voice audio exceeded its delivery limit.');
    return bytes;
  };
}
