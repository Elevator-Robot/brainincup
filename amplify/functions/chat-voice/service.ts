import { validSpeechAlignment, type SpeechPacket } from '../../../shared/chatSpeech';

/** Server-only ElevenLabs transport, shared by Lambda and the local dev proxy. */
export interface VoiceConfig { apiKey: string; voiceId?: string }

export function createVoiceService(config: VoiceConfig) {
  const API = 'https://api.elevenlabs.io';

  return async (input: string, parentSignal?: AbortSignal): Promise<SpeechPacket> => {
    const text = typeof input === 'string' ? input.trim() : '';
    if (!text || text.length > 1000) throw new Error('Speech requires 1–1000 characters.');
    if (!config.apiKey) throw new Error('Chat voice is not configured yet.');
    const voice = config.voiceId?.trim();
    if (!voice) throw new Error('Configure ELEVENLABS_VOICE_ID for Brain.');
    const timeout = AbortSignal.timeout(25_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
    const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_22050_32`, {
      method: 'POST', signal,
      headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Voice is busy. Please try again shortly.' : 'Brain’s voice is temporarily unavailable.');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Voice returned an invalid audio format.');
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error('Voice audio exceeded its delivery limit.');
    let data: { audio_base64?: unknown; alignment?: { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown } };
    try { data = JSON.parse(raw); }
    catch { throw new Error('Voice returned an invalid audio format.'); }
    if (!data || typeof data !== 'object') throw new Error('Voice returned an invalid audio format.');
    const audio = data.audio_base64;
    if (typeof audio !== 'string' || !audio.length || audio.length > 934_000 || audio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)) throw new Error('Voice returned invalid audio.');
    const source = data.alignment;
    const alignment = validSpeechAlignment(source ? {
      characters: source.characters, startTimes: source.character_start_times_seconds, endTimes: source.character_end_times_seconds,
    } : null, text);
    return { audio, contentType: 'audio/mpeg', alignment };
  };
}
