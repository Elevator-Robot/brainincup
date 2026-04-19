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
  currentLocation = 'The Shrouded Vale',
  visitedLocations = [],
  connectedAreas = [],
  characterLevel = 1,
}: WorldMapPanelProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Current location */}
      <div>
        <div className="text-xs text-brand-text-secondary mb-1">Current Location</div>
        <div className="text-brand-text-primary font-semibold text-sm">{currentLocation}</div>
      </div>

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
                    <span className="text-xs text-brand-text-secondary ml-2 shrink-0">
                      🔒{area.requiredLevel ? ` Lv.${area.requiredLevel}` : ''}
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
