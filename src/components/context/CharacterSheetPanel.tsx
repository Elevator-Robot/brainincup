interface CharacterSheetPanelProps {
  name?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  currentXP?: number;
  xpToNextLevel?: number;
  avatarSrc?: string;
  avatarSrcWebp?: string;
  stats?: {
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  };
  levelUpAnimating?: boolean;
}

const STAT_LABELS: [keyof NonNullable<CharacterSheetPanelProps['stats']>, string][] = [
  ['strength', 'STR'],
  ['dexterity', 'DEX'],
  ['constitution', 'CON'],
  ['intelligence', 'INT'],
  ['wisdom', 'WIS'],
  ['charisma', 'CHA'],
];

function statModifier(value: number): string {
  const mod = Math.floor((value - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function CharacterSheetPanel({
  name,
  level,
  currentHP,
  maxHP,
  currentXP,
  xpToNextLevel,
  avatarSrc,
  avatarSrcWebp,
  stats,
  levelUpAnimating = false,
}: CharacterSheetPanelProps) {
  const resolvedHP = currentHP ?? 0;
  const resolvedMaxHP = maxHP ?? 0;
  const hpPercent = resolvedMaxHP > 0 ? Math.min(100, (resolvedHP / resolvedMaxHP) * 100) : 0;
  const resolvedXP = currentXP ?? 0;
  const resolvedXPMax = xpToNextLevel ?? 100;
  const xpPercent = resolvedXPMax > 0 ? Math.min(100, (resolvedXP / resolvedXPMax) * 100) : 0;
  const hpBarColor = hpPercent <= 25 ? 'bg-brand-status-error' : 'bg-green-500';

  return (
    <div className={`retro-character-sheet space-y-3 ${levelUpAnimating ? 'animate-pulse' : ''}`}>
      {/* Character identity */}
      <div className="retro-character-identity flex items-center gap-3">
        {avatarSrc && (
          <picture className="retro-character-avatar-picture">
            {avatarSrcWebp && <source srcSet={avatarSrcWebp} type="image/webp" />}
            <img
              src={avatarSrc}
              alt={`${name} avatar`}
              loading="lazy"
              decoding="async"
              className="retro-character-avatar h-14 w-14 rounded-xl object-cover object-center"
            />
          </picture>
        )}
        <div className="retro-character-meta flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h2 className="text-brand-text-primary font-semibold text-sm truncate">{name}</h2>
            <span className={`shrink-0 text-[10px] font-medium py-0.5 ${
              levelUpAnimating
                ? 'text-brand-accent-primary'
                : 'text-brand-text-muted'
            }`}>
              Lv {level}
            </span>
          </div>
        </div>
      </div>

      {/* HP bar */}
      <div>
        <div className="flex justify-between text-[10px] text-brand-text-muted mb-1">
          <span>HP</span>
          <span>{resolvedHP} / {resolvedMaxHP}</span>
        </div>
        <div className="w-full bg-brand-surface-border rounded-full h-1.5">
          <div
            className={`${hpBarColor} h-1.5 rounded-full transition-all duration-300`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* XP bar */}
      <div>
        <div className="flex justify-between text-[10px] text-brand-text-muted mb-1">
          <span>XP</span>
          <span>{resolvedXP} / {resolvedXPMax}</span>
        </div>
        <div className="w-full bg-brand-surface-border rounded-full h-1.5">
          <div
            className="bg-brand-accent-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <dl className="cosmic-character-stats grid grid-cols-3 gap-x-4">
        {STAT_LABELS.map(([key, label]) => {
          const value = stats?.[key] ?? 0;
          return (
            <div
              key={key}
              className="py-2"
            >
              <dt className="text-[9px] text-brand-text-muted uppercase tracking-wider">{label}</dt>
              <dd className="mt-1 flex items-baseline gap-2"><span className="text-brand-text-primary font-semibold text-sm leading-tight">{value}</span>
                <span className="text-[10px] text-brand-text-muted">{statModifier(value)}</span></dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default CharacterSheetPanel;
