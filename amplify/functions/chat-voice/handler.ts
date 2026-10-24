import type { Schema } from '../../data/resource';
import { createVoiceService } from './service';

let service: ReturnType<typeof createVoiceService> | undefined;

export const handler: Schema['generateChatSpeech']['functionHandler'] = async event => {
  // AppSync enforces user-pool authentication; never accept identity from input.
  if (!event.identity || !('sub' in event.identity) || !event.identity.sub) throw new Error('Sign in to use voice.');
  service ??= createVoiceService({
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    voiceId: process.env.ELEVENLABS_VOICE_ID,
  });
  const bytes = await service(event.arguments.text);
  return { audio: Buffer.from(bytes).toString('base64'), contentType: 'audio/mpeg' };
};
