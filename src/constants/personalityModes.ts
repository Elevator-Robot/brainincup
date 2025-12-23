export type PersonalityModeId = 'default' | 'game_master';

export interface PersonalityModeMeta {
  id: PersonalityModeId;
  icon: string;
  title: string;
  description: string;
  badge: string;
  accent: string;
  shortLabel: string;
  tagClass: string;
}

export const normalizePersonalityMode = (mode?: string | null): PersonalityModeId => {
  if (!mode) return 'default';
  if (mode === 'rpg_dm') return 'game_master';
  if (mode === 'game_master' || mode === 'default') return mode;
  return 'default';
};

export const MODE_OPTIONS: PersonalityModeMeta[] = [
  {
    id: 'default',
    icon: '🧠',
    title: 'Experience Brain',
    description: 'A reflective companion for journaling, synthesis, and late-night thinking.',
    badge: 'Living notebook',
    accent: 'from-violet-500/80 to-fuchsia-500/80',
    shortLabel: 'Brain',
    tagClass: 'bg-violet-500/10 text-violet-100 border-violet-400/30'
  },
  {
    id: 'game_master',
    icon: '🎲',
    title: 'Game Master Adventure',
    description: 'An improvisational dungeon master that leads surreal quests and adapts to every choice.',
    badge: 'Narrative mode',
    accent: 'from-amber-500/80 to-orange-500/80',
    shortLabel: 'Game Master',
    tagClass: 'bg-amber-500/10 text-amber-100 border-amber-400/40'
  }
];

export const MODE_META = MODE_OPTIONS.reduce<Record<PersonalityModeId, PersonalityModeMeta>>((acc, option) => {
  acc[option.id] = option;
  return acc;
}, {
  default: MODE_OPTIONS[0],
  game_master: MODE_OPTIONS[1]
} as Record<PersonalityModeId, PersonalityModeMeta>);

export const getModeMeta = (mode?: string | null): PersonalityModeMeta => {
  const normalized = normalizePersonalityMode(mode);
  return MODE_META[normalized];
};
