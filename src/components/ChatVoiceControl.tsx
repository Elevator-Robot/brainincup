import { useId, useState } from 'react';

export default function ChatVoiceControl({ enabled, status, error, onToggle, placement = 'default' }: {
  enabled: boolean; status: 'idle' | 'loading' | 'playing'; error: string | null; onToggle: () => void;
  placement?: 'default' | 'rail' | 'composer-tab';
}) {
  const tipId = useId();
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const tooltip = error || (enabled ? 'Mute Brain’s voice at any time' : 'Hear Brain — unmute to bring the conversation to life');
  return <div className={`cosmic-voice-control cosmic-voice-control--${placement}`} data-tooltip-dismissed={tooltipDismissed}
    onPointerEnter={() => setTooltipDismissed(false)} onFocus={() => setTooltipDismissed(false)}
    onKeyDown={event => { if (event.key === 'Escape') setTooltipDismissed(true); }}>
    <button type="button" className="cosmic-voice-toggle" onClick={onToggle}
      aria-label={enabled ? 'Mute chat voice' : 'Unmute chat voice'} aria-pressed={enabled}
      aria-describedby={tipId} title={tooltip}>
      {placement === 'rail' ? <span className="cosmic-voice-wave" data-voice-state={!enabled ? 'muted' : status} aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span> : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4Z" strokeLinejoin="round" />
        {enabled ? <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" strokeLinecap="round" /></> : <path d="m16 9 5 6m0-6-5 6" strokeLinecap="round" />}
      </svg>}
      <span className={placement === 'rail' ? 'sr-only' : undefined}>{!enabled ? 'Unmute' : status === 'loading' ? 'Preparing…' : status === 'playing' ? 'Speaking' : 'Voice on'}</span>
      {placement === 'rail' && <span className="cosmic-voice-led" data-enabled={enabled} aria-hidden="true" />}
    </button>
    <span id={tipId} role="tooltip" className="cosmic-voice-tooltip">
      {placement === 'rail' && <><strong className="cosmic-voice-flyout-title">Brain’s voice <small>{!enabled ? 'MUTED' : status === 'playing' ? 'SPEAKING' : status === 'loading' ? 'PREPARING' : 'VOICE ON'}</small></strong><span className="cosmic-voice-flyout-copy">One voice · every conversation</span></>}
      {tooltip}
    </span>
    <span role="status" className="sr-only">{error || (status === 'loading' ? 'Preparing Brain’s voice' : '')}</span>
    {error && <span className="cosmic-voice-error" role="alert">{error}</span>}
  </div>;
}
