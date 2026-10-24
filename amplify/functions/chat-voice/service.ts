/** Server-only ElevenLabs transport, shared by Lambda and the local dev proxy. */
export interface VoiceConfig { apiKey: string; voiceId?: string }

export function createVoiceService(config: VoiceConfig) {
  const API = 'https://api.elevenlabs.io';

  return async (input: string, parentSignal?: AbortSignal): Promise<Uint8Array> => {
    const text = typeof input === 'string' ? input.trim() : '';
    if (!text || text.length > 1000) throw new Error('Speech requires 1–1000 characters.');
    if (!config.apiKey) throw new Error('Chat voice is not configured yet.');
    const voice = config.voiceId?.trim();
    if (!voice) throw new Error('Configure ELEVENLABS_VOICE_ID for Brain.');
    const timeout = AbortSignal.timeout(25_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_22050_32`, {
      method: 'POST', signal,
      headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Voice is busy. Please try again shortly.' : 'Brain’s voice is temporarily unavailable.');
    if (!response.headers.get('content-type')?.includes('audio/')) throw new Error('Voice returned an invalid audio format.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 700_000) throw new Error('Voice audio exceeded its delivery limit.');
    return bytes;
  };
}
