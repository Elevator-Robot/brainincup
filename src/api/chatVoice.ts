import { dataClient } from './dataClient';
import { validSpeechAlignment, type SpeechAlignment } from '../../shared/chatSpeech';

export interface GeneratedSpeech { blob: Blob; alignment: SpeechAlignment | null }
function decodeSpeech(value: unknown, text: string): GeneratedSpeech {
  const packet = value as { audio?: unknown; contentType?: unknown; alignment?: unknown } | null;
  if (!packet || typeof packet.audio !== 'string' || packet.contentType !== 'audio/mpeg') throw new Error('Invalid voice response.');
  const bytes = Uint8Array.from(atob(packet.audio), character => character.charCodeAt(0));
  if (!bytes.length) throw new Error('Empty voice response.');
  return { blob: new Blob([bytes], { type: 'audio/mpeg' }), alignment: validSpeechAlignment(packet.alignment, text) };
}

export async function generateChatSpeech(text: string, signal: AbortSignal): Promise<GeneratedSpeech> {
  signal.throwIfAborted();
  if (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    const response = await fetch('/__local/chat-voice', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Brain-Voice': 'local' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error || 'Local voice is unavailable.');
    }
    // An older local server can still play audio, but must never fake timing.
    if (response.headers.get('content-type')?.includes('audio/mpeg')) return { blob: await response.blob(), alignment: null };
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Local voice returned invalid audio.');
    return decodeSpeech(await response.json(), text);
  }
  // Amplify attaches the authenticated user's token. No ElevenLabs key in JS.
  try {
    if (!dataClient.mutations?.generateChatSpeech) throw new Error('Voice needs backend setup.');
    const request = dataClient.mutations.generateChatSpeech({ text });
    const cancel = () => dataClient.cancel(request, 'Voice muted or conversation changed');
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await request;
      signal.throwIfAborted();
      if (result.errors?.length || !result.data?.audio || result.data.contentType !== 'audio/mpeg') {
        throw new Error('Voice is unavailable.');
      }
      return decodeSpeech(result.data, text);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  } catch {
    signal.throwIfAborted();
    throw new Error('Brain’s voice is unavailable. Please try again.');
  }
}
