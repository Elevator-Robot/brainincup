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
        <div className="text-2xl opacity-30">📜</div>
        <p className="text-[11px] text-brand-text-muted uppercase tracking-wider">No events yet</p>
        <p className="text-[10px] text-brand-text-muted opacity-60">Your adventure will be recorded here</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-0">
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
                <p className="text-[9px] uppercase tracking-widest text-brand-accent-primary/70 mb-0.5 truncate">
                  {entry.location ?? currentLocation}
                </p>
              )}

              {/* Narration snippet */}
              <p className={`text-[11px] leading-relaxed ${
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
                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-surface-dark border border-brand-surface-border text-brand-text-muted italic truncate max-w-[120px]"
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
