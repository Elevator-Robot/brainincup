import { dataClient } from './dataClient';

export async function generateChatSpeech(text: string, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
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
      const bytes = Uint8Array.from(atob(result.data.audio), character => character.charCodeAt(0));
      return new Blob([bytes], { type: 'audio/mpeg' });
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  } catch {
    signal.throwIfAborted();
    throw new Error('Aaron’s voice is unavailable. Please try again.');
  }
}
