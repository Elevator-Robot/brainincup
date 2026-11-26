import { useEffect, useMemo, useRef } from 'react';
import type { Message } from '../components/MessageBubble';
import type { SpeechPlayback } from '../chat/speech';
import { spokenText } from '../utils/chatSpeech';

/** A real media clock with silent fixture audio. Never calls a speech provider. */
export default function SpeechTimingControls({ message, onPlayback, onRelease }: {
  message: Message;
  onPlayback: (playback: SpeechPlayback | null) => void;
  onRelease: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<AbortController>();
  const text = useMemo(() => spokenText(message.content), [message.content]);
  const alignment = useMemo(() => ({
    characters: [...text],
    startTimes: [...text].map((_, index) => index * .055),
    endTimes: [...text].map((_, index) => (index + 1) * .055),
  }), [text]);
  useEffect(() => {
    const element = audio.current!;
    const size = Math.ceil((alignment.endTimes.at(-1)! + .2) * 8000);
    const bytes = new Uint8Array(44 + size).fill(128);
    const view = new DataView(bytes.buffer);
    const label = (offset: number, value: string) => [...value].forEach((character, i) => view.setUint8(offset + i, character.charCodeAt(0)));
    label(0, 'RIFF'); view.setUint32(4, 36 + size, true); label(8, 'WAVE');
    label(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    label(36, 'data'); view.setUint32(40, size, true);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    element.src = url;
    return () => { controller.current?.abort(); element.pause(); URL.revokeObjectURL(url); };
  }, [alignment]);
  const bindPlayback = (element: HTMLAudioElement) => {
    controller.current?.abort();
    controller.current = new AbortController();
    onPlayback({ message, audio: element, text, offset: 0, alignment, signal: controller.current.signal });
  };
  const start = () => {
    const element = audio.current!;
    element.currentTime = 0;
    bindPlayback(element);
    void element.play();
  };
  return <section className="cosmic-speech-fixture" aria-label="Speech timing demo">
    <div className="cosmic-preview-controls">
      <button type="button" aria-label="Replay timed text" onClick={start}>Replay</button>
      <button type="button" onClick={() => {
        controller.current?.abort(); audio.current?.pause(); onRelease(); onPlayback(null);
      }}>Stop audio</button>
      <label>Speed <select aria-label="Playback speed" defaultValue="1" onChange={event => {
        if (audio.current) audio.current.playbackRate = Number(event.target.value);
      }}><option value=".5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
    </div>
    <audio ref={audio} controls aria-label="Silent timing track" onPlay={event => {
      if (!controller.current || controller.current.signal.aborted) bindPlayback(event.currentTarget);
    }} />
    <p>Silent timing fixture · No speech synthesis</p>
  </section>;
}
