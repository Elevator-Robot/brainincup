import { useId } from 'react';

export default function ChatVoiceControl({ enabled, status, error, onToggle }: {
  enabled: boolean; status: 'idle' | 'loading' | 'playing'; error: string | null; onToggle: () => void;
}) {
  const tipId = useId();
  const tooltip = error || (enabled ? 'Mute Aaron’s voice at any time' : 'Try Aaron’s voice — unmute to hear replies');
  return <div className="cosmic-voice-control">
    <button type="button" className="cosmic-voice-toggle" onClick={onToggle}
      aria-label={enabled ? 'Mute chat voice' : 'Unmute chat voice'} aria-pressed={enabled}
      aria-describedby={tipId} title={tooltip}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4Z" strokeLinejoin="round" />
        {enabled ? <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" strokeLinecap="round" /></> : <path d="m16 9 5 6m0-6-5 6" strokeLinecap="round" />}
      </svg>
      <span>{!enabled ? 'Unmute' : status === 'loading' ? 'Preparing…' : status === 'playing' ? 'Speaking' : 'Voice on'}</span>
    </button>
    <span id={tipId} role="tooltip" className="cosmic-voice-tooltip">{tooltip}</span>
    <span role="status" className="sr-only">{error || (status === 'loading' ? 'Preparing Aaron’s voice' : '')}</span>
    {error && <span className="cosmic-voice-error" role="alert">{error}</span>}
  </div>;
}
