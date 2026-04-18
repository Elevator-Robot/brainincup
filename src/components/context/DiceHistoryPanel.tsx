interface DiceRollEntry {
  statName: string;
  diceValue: number;
  statModifier: number;
  difficultyClass: number;
  outcome: 'CRITICAL_SUCCESS' | 'SUCCESS' | 'FAILURE' | 'CRITICAL_FAILURE';
  rollResult: number;
}

interface DiceHistoryPanelProps {
  diceRollLog?: DiceRollEntry[];
  pendingDiceRoll?: { statName: string; difficultyClass: number } | null;
}

const OUTCOME_STYLES: Record<DiceRollEntry['outcome'], string> = {
  CRITICAL_SUCCESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  SUCCESS: 'bg-green-500/20 text-green-400 border-green-500/40',
  FAILURE: 'bg-brand-status-error/20 text-brand-status-error border-brand-status-error/40',
  CRITICAL_FAILURE: 'bg-red-900/30 text-red-400 border-red-700/40',
};

const OUTCOME_LABELS: Record<DiceRollEntry['outcome'], string> = {
  CRITICAL_SUCCESS: 'Crit!',
  SUCCESS: 'Success',
  FAILURE: 'Fail',
  CRITICAL_FAILURE: 'Crit Fail',
};

function DiceHistoryPanel({ diceRollLog = [], pendingDiceRoll }: DiceHistoryPanelProps) {
  const recent = diceRollLog.slice(-5).reverse();

  return (
    <div className="p-4 space-y-3">
      {/* Pending roll */}
      {pendingDiceRoll && (
        <div className="rounded-lg border border-brand-accent-primary bg-brand-accent-primary/10 p-3 animate-pulse">
          <div className="text-xs text-brand-accent-primary font-medium mb-0.5">Pending Roll</div>
          <div className="text-brand-text-primary text-sm">
            {pendingDiceRoll.statName} — DC {pendingDiceRoll.difficultyClass}
          </div>
        </div>
      )}

      {/* Roll history */}
      {recent.length === 0 && !pendingDiceRoll && (
        <div className="text-brand-text-secondary text-sm text-center">No dice rolls yet.</div>
      )}

      {recent.map((entry, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 text-sm ${OUTCOME_STYLES[entry.outcome]}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium capitalize">{entry.statName}</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded border border-current">
              {OUTCOME_LABELS[entry.outcome]}
            </span>
          </div>
          <div className="text-xs opacity-80 space-x-2">
            <span>🎲 {entry.diceValue}</span>
            <span>Mod {entry.statModifier >= 0 ? `+${entry.statModifier}` : entry.statModifier}</span>
            <span>= {entry.rollResult}</span>
            <span>vs DC {entry.difficultyClass}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default DiceHistoryPanel;
