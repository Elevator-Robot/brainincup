import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '../components/MessageBubble';
import { generateChatSpeech } from '../api/chatVoice';
import { speechChunks, spokenText } from '../utils/chatSpeech';

type VoiceStatus = 'idle' | 'loading' | 'playing';
const messageKey = (message: Message, index: number) => message.messageId ?? `${index}:${message.content}`;
const readable = (message: Message) => message.role === 'assistant' && !message.isTyping && !message.streamError && !message.diceRoll && Boolean(message.content.trim());
const visibleMessages = (messages: Message[]) => {
  const rollingIndex = messages.findIndex(message => message.diceRoll?.phase === 'rolling');
  return rollingIndex < 0 ? messages : messages.slice(0, rollingIndex + 1);
};

// Unlock the same media element in the unmute/listen click, including on iOS.
// This is a silent one-sample WAV; no provider call is made to unlock playback.
const SILENCE = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQEAAACA';

export function useChatVoice(conversationId: string | null | undefined, messages: Message[]) {
  // Deliberately session-only: every fresh page starts silent.
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const enabledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controller = useRef(new AbortController());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const seen = useRef(new Set<string>());
  const currentUrl = useRef<string>();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const stop = useCallback(() => {
    controller.current.abort();
    controller.current = new AbortController();
    queue.current = Promise.resolve();
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = undefined;
    setStatus('idle');
  }, []);

  const enqueue = useCallback((content: string) => {
    if (!enabledRef.current) return;
    const text = spokenText(content);
    if (!text) return;
    const signal = controller.current.signal;
    queue.current = queue.current.then(async () => {
      if (signal.aborted) return;
      setError(null);
      try {
        for (const chunk of speechChunks(text)) {
          signal.throwIfAborted();
          setStatus('loading');
          const blob = await generateChatSpeech(chunk, signal);
          signal.throwIfAborted();
          const audio = audioRef.current ?? (audioRef.current = new Audio());
          const url = URL.createObjectURL(blob);
          currentUrl.current = url;
          try {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                audio.removeEventListener('ended', ended);
                audio.removeEventListener('error', failed);
                signal.removeEventListener('abort', aborted);
              };
              const ended = () => { cleanup(); resolve(); };
              const failed = () => { cleanup(); reject(new Error('Audio playback failed.')); };
              const aborted = () => { cleanup(); reject(new DOMException('Stopped', 'AbortError')); };
              audio.addEventListener('ended', ended);
              audio.addEventListener('error', failed);
              signal.addEventListener('abort', aborted, { once: true });
              audio.src = url;
              audio.play().then(() => { if (!signal.aborted) setStatus('playing'); }).catch(() => {
                cleanup(); reject(new Error('Tap a reply’s Listen button to allow audio playback.'));
              });
            });
          } finally {
            URL.revokeObjectURL(url);
            if (currentUrl.current === url) currentUrl.current = undefined;
          }
        }
      } catch (cause) {
        if (!signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Voice is unavailable.');
          // Do not keep making paid requests when playback or the provider fails.
          enabledRef.current = false;
          setEnabled(false);
          stop();
        }
      } finally {
        if (!signal.aborted) setStatus('idle');
      }
    });
  }, [stop]);

  const listen = useCallback((content: string) => {
    stop();
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    audio.src = SILENCE;
    void audio.play().catch(() => { /* A real play rejection is surfaced below. */ });
    enabledRef.current = true;
    setEnabled(true);
    setError(null);
    // Mark the current page handled: explicit playback never replays a backlog.
    visibleMessages(messagesRef.current).forEach((message, index) => { if (readable(message)) seen.current.add(messageKey(message, index)); });
    enqueue(content);
  }, [enqueue, stop]);

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      enabledRef.current = false;
      setEnabled(false);
      setError(null);
      stop();
      return;
    }
    // Unmute is an explicit request to hear the latest completed reply.
    const latest = [...visibleMessages(messagesRef.current)].reverse().find(readable);
    listen(latest?.content ?? '');
  }, [listen, stop]);

  useEffect(() => {
    seen.current.clear();
    messagesRef.current.forEach((message, index) => { if (readable(message)) seen.current.add(messageKey(message, index)); });
    stop();
    return stop;
  }, [conversationId, stop]);

  useEffect(() => {
    // Match MessageList: narration behind a rolling die is not revealed yet.
    const visible = visibleMessages(messages);
    visible.forEach((message, index) => {
      if (!readable(message)) return;
      const key = messageKey(message, index);
      if (seen.current.has(key)) return;
      seen.current.add(key);
      // Hydrated history is never automatically narrated.
      if (message.populateOnMount && enabledRef.current) enqueue(message.content);
    });
  }, [messages, enqueue]);

  return { enabled, status, error, toggle, listen, stop };
}
