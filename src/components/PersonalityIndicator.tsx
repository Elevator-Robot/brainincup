interface PersonalityIndicatorProps {
  personality: string;
}

export default function PersonalityIndicator({ personality }: PersonalityIndicatorProps) {
  if (personality === 'default') return null;

  const getPersonalityInfo = () => {
    switch (personality) {
      case 'game_master':
        return {
          name: 'Game Master Mode',
          icon: '🎲',
          color: 'from-amber-500 to-orange-500',
          borderColor: 'border-amber-500/30',
          bgColor: 'bg-amber-500/10'
        };
      case 'rpg_dm':
        return {
          name: 'Game Master Mode',
          icon: '🎲',
          color: 'from-amber-500 to-orange-500',
          borderColor: 'border-amber-500/30',
          bgColor: 'bg-amber-500/10'
        };
      default:
        return null;
    }
  };

  const info = getPersonalityInfo();
  if (!info) return null;

  return (
    <div className="animate-slide-up w-full">
      <div className={`w-full p-4 rounded-2xl glass border ${info.borderColor} ${info.bgColor} backdrop-blur-xl shadow-glass`}
        aria-live="polite">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${info.color} flex items-center justify-center text-xl shadow-glow-sm`}>
            {info.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-text-primary text-sm">
                {info.name}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
              {(personality === 'game_master' || personality === 'rpg_dm') && 'Your adventure awaits. Let the Game Master lead the narrative wherever you take it.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
