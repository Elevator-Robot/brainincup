import { defineFunction, secret } from '@aws-amplify/backend';

export const chatVoice = defineFunction({
  name: 'chat-voice',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    ELEVENLABS_API_KEY: secret('ELEVENLABS_API_KEY'),
    // Brain's provider voice ID is independent of its label in ElevenLabs.
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID ?? '',
  },
});
