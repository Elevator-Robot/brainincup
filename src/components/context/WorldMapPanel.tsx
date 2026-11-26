interface ConnectedArea {
  id: string;
  displayName: string;
  locked: boolean;
  requiredLevel?: number;
}

interface WorldMapPanelProps {
  currentLocation?: string;
  visitedLocations?: string[];
  connectedAreas?: ConnectedArea[];
  characterLevel?: number;
}

function WorldMapPanel({
  currentLocation,
  visitedLocations = [],
  connectedAreas = [],
  characterLevel = 1,
}: WorldMapPanelProps) {
  return (
    <div className="cosmic-context-section space-y-4">
      {/* Current location */}
      {currentLocation?.trim() && <div>
        <div className="cosmic-context-label mb-2">Current location</div>
        <div className="text-brand-text-primary font-semibold text-sm">{currentLocation}</div>
      </div>}

      {/* Connected areas */}
      {connectedAreas.length > 0 && (
        <div>
          <div className="text-xs text-brand-text-secondary mb-2">Connected Areas</div>
          <div className="space-y-1.5">
            {connectedAreas.map((area) => {
              const isLocked = area.locked || (area.requiredLevel !== undefined && characterLevel < area.requiredLevel);
              return (
                <div
                  key={area.id}
                  className={`flex items-center justify-between rounded p-2 text-sm ${
                    isLocked
                      ? 'bg-brand-surface-dark text-brand-text-secondary opacity-60'
                      : 'bg-brand-surface-dark text-brand-text-primary'
                  }`}
                >
                  <span>{area.displayName}</span>
                  {isLocked && (
                    <span className="flex items-center gap-1 text-xs text-brand-text-secondary ml-2 shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                      {area.requiredLevel ? `Lv. ${area.requiredLevel}` : 'Locked'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Visited locations */}
      {visitedLocations.length > 0 && (
        <div>
          <div className="text-xs text-brand-text-secondary mb-2">Visited</div>
          <div className="space-y-1">
            {visitedLocations.map((loc) => (
              <div
                key={loc}
                className="text-xs text-brand-text-secondary bg-brand-surface-dark rounded px-2 py-1"
              >
                {loc}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorldMapPanel;
