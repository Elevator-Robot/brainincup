export type PersonalityModeId = 'brain' | 'game_master';

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
  if (!mode) return 'brain';
  if (mode === 'rpg_dm') return 'game_master';
  if (mode === 'default') return 'brain';
  if (mode === 'game_master' || mode === 'brain') return mode;
  return 'brain';
};

export const MODE_OPTIONS: PersonalityModeMeta[] = [
  {
    id: 'brain',
    icon: '🧠',
    title: 'Experience Brain',
    description: 'A reflective, philosophical companion and existential experiment. Explore consciousness, identity, and the nature of existence through introspective dialogue.',
    badge: 'Consciousness',
    accent: 'from-violet-500/80 to-fuchsia-500/80',
    shortLabel: 'Brain',
    tagClass: 'bg-violet-500/10 text-violet-100 border-violet-400/30'
  },
  {
    id: 'game_master',
    icon: '🎲',
    title: 'Game Master',
    description: 'A structured RPG experience with quests, character progression, and tactical combat. Build your hero and explore persistent worlds.',
    badge: 'RPG Adventure',
    accent: 'from-amber-500/80 to-orange-500/80',
    shortLabel: 'Game Master',
    tagClass: 'bg-amber-500/10 text-amber-100 border-amber-400/40'
  }
];

// Brain is the base website experience; facilitated modes are explicit opt-ins.
export const FACILITATED_MODE_OPTIONS: PersonalityModeMeta[] = MODE_OPTIONS.filter(
  (option) => option.id !== 'brain',
);

export const MODE_META = MODE_OPTIONS.reduce<Record<PersonalityModeId, PersonalityModeMeta>>((acc, option) => {
  acc[option.id] = option;
  return acc;
}, {
  brain: MODE_OPTIONS[0],
  game_master: MODE_OPTIONS[1]
} as Record<PersonalityModeId, PersonalityModeMeta>);

export const getModeMeta = (mode?: string | null): PersonalityModeMeta => {
  const normalized = normalizePersonalityMode(mode);
  return MODE_META[normalized];
};
