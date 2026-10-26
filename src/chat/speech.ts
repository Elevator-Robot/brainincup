import type { SpeechAlignment } from '../../shared/chatSpeech';
import type { Message } from '../components/MessageBubble';

/** Ephemeral playback state, never persisted with conversations. */
export interface SpeechPlayback {
  message?: Message;
  audio: HTMLAudioElement;
  text: string;
  offset: number;
  alignment: SpeechAlignment | null;
  signal?: AbortSignal;
}
