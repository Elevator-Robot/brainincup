interface TimelineEntry {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  sensations?: string[];
  thoughts?: string[];
  location?: string;
}

interface TimelinePanelProps {
  entries?: TimelineEntry[];
  currentLocation?: string;
}

function TimelinePanel({ entries = [], currentLocation }: TimelinePanelProps) {
  const assistantEntries = entries
    .filter((e) => e.role === 'assistant' && e.content?.trim())
    .slice(-20) // keep last 20 turns
    .reverse();  // newest first

  if (assistantEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="text-brand-text-muted" aria-hidden="true"><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <p className="cosmic-context-label">No events yet</p>
        <p className="text-xs text-brand-text-muted">Your adventure will be recorded here</p>
      </div>
    );
  }

  return (
    <div className="cosmic-context-section space-y-0">
      {assistantEntries.map((entry, i) => {
        const snippet = entry.content
          ? entry.content.replace(/\[.*?\]/g, '').trim().slice(0, 120) + (entry.content.length > 120 ? '…' : '')
          : '';
        const isFirst = i === 0;

        return (
          <div key={entry.id} className="relative flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center">
              <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                isFirst ? 'bg-brand-accent-primary ring-2 ring-brand-accent-primary/30' : 'bg-brand-surface-border'
              }`} />
              {i < assistantEntries.length - 1 && (
                <div className="w-px flex-1 bg-brand-surface-border/50 mt-1 mb-0 min-h-[20px]" />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 min-w-0 flex-1 ${i < assistantEntries.length - 1 ? '' : 'pb-2'}`}>
              {/* Location tag */}
              {(entry.location || (isFirst && currentLocation)) && (
                <p className="cosmic-context-label text-brand-accent-primary mb-1 break-words">
                  {entry.location ?? currentLocation}
                </p>
              )}

              {/* Narration snippet */}
              <p className={`text-[13px] leading-relaxed ${
                isFirst ? 'text-brand-text-primary' : 'text-brand-text-secondary'
              }`}>
                {snippet}
              </p>

              {/* Sensations */}
              {isFirst && entry.sensations && entry.sensations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {entry.sensations.slice(0, 3).map((s, si) => (
                    <span
                      key={si}
                      className="text-[11px] text-brand-text-muted italic truncate max-w-[140px] after:content-['·'] after:ml-1 last:after:content-none"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { TimelineEntry };
export default TimelinePanel;
