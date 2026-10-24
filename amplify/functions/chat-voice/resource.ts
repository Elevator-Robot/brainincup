import { defineFunction, secret } from '@aws-amplify/backend';

export const chatVoice = defineFunction({
  name: 'chat-voice',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    ELEVENLABS_API_KEY: secret('ELEVENLABS_API_KEY'),
    ELEVENLABS_VOICE_NAME: 'Aaron',
    // Optional stable ID avoids discovery if multiple voices share the name.
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID ?? '',
  },
});
