interface CharacterSheetPanelProps {
  name?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  currentXP?: number;
  xpToNextLevel?: number;
  currentLocation?: string;
  avatarSrc?: string;
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
  name = 'Adventurer',
  level = 1,
  currentHP = 10,
  maxHP = 10,
  currentXP = 0,
  xpToNextLevel = 100,
  currentLocation,
  avatarSrc,
  stats = {},
  levelUpAnimating = false,
}: CharacterSheetPanelProps) {
  const hpPercent = maxHP > 0 ? Math.min(100, (currentHP / maxHP) * 100) : 0;
  const xpPercent = xpToNextLevel > 0 ? Math.min(100, (currentXP / xpToNextLevel) * 100) : 0;
  const hpBarColor = hpPercent <= 25 ? 'bg-brand-status-error' : 'bg-green-500';

  return (
    <div className={`p-4 space-y-3 ${levelUpAnimating ? 'animate-pulse' : ''}`}>
      {/* Avatar + name + location + level */}
      <div className="retro-character-identity flex items-center gap-3">
        {avatarSrc && (
          <div className="retro-character-avatar-wrap">
            <img
              src={avatarSrc}
              alt={`${name} avatar`}
              className="retro-character-avatar h-14 w-14 rounded-xl object-cover object-center"
            />
          </div>
        )}
        <div className="retro-character-meta flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h2 className="text-brand-text-primary font-semibold text-sm truncate">{name}</h2>
            <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              levelUpAnimating
                ? 'bg-brand-accent-primary/20 border-brand-accent-primary text-brand-accent-primary'
                : 'bg-brand-surface-dark border-brand-surface-border text-brand-text-secondary'
            }`}>
              Lv {level}
            </span>
          </div>
          {currentLocation && (
            <p className="text-[11px] text-brand-text-muted truncate mt-0.5">{currentLocation}</p>
          )}
        </div>
      </div>

      {/* HP bar */}
      <div>
        <div className="flex justify-between text-[10px] text-brand-text-muted mb-1">
          <span>HP</span>
          <span>{currentHP} / {maxHP}</span>
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
          <span>{currentXP} / {xpToNextLevel}</span>
        </div>
        <div className="w-full bg-brand-surface-border rounded-full h-1.5">
          <div
            className="bg-brand-accent-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {STAT_LABELS.map(([key, label]) => {
          const value = stats[key] ?? 10;
          return (
            <div
              key={key}
              className="bg-brand-surface-dark rounded-lg p-1.5 text-center"
            >
              <div className="text-[9px] text-brand-text-muted uppercase tracking-wider">{label}</div>
              <div className="text-brand-text-primary font-semibold text-sm leading-tight">{value}</div>
              <div className="text-[10px] text-brand-text-secondary">{statModifier(value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CharacterSheetPanel;
