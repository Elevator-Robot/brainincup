import { getModeMeta, normalizePersonalityMode } from '../constants/personalityModes';

interface PersonalityIndicatorProps {
  personality: string;
  className?: string;
}

const MODE_STATUS_TEXT = {
  default: 'Reflective lens active',
  game_master: 'Narrative lens active',
} as const;

export default function PersonalityIndicator({ personality, className = '' }: PersonalityIndicatorProps) {
  const normalized = normalizePersonalityMode(personality);
  const modeMeta = getModeMeta(normalized);
  const isGameMaster = normalized === 'game_master';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs backdrop-blur-md ${
        isGameMaster
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          : 'border-violet-400/40 bg-violet-500/10 text-violet-100'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isGameMaster ? 'bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.75)]' : 'bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.75)]'
        }`}
      />
      <span className="font-medium tracking-wide">{modeMeta.shortLabel}</span>
      <span className={isGameMaster ? 'text-amber-200/75' : 'text-violet-200/75'}>
        {MODE_STATUS_TEXT[normalized]}
      </span>
    </div>
  );
}
