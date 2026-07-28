export type ExperienceId = 'brain' | 'game_master';

export interface ExperienceMeta {
  id: ExperienceId;
  icon: string;
  title: string;
  description: string;
  badge: string;
  accent: string;
  shortLabel: string;
  tagClass: string;
}

export const normalizeExperience = (exp?: string | null): ExperienceId => {
  if (!exp) return 'brain';
  const lower = exp.toLowerCase();
  if (lower === 'rpg_dm' || lower === 'game_master') return 'game_master';
  if (lower === 'default' || lower === 'brain') return 'brain';
  return 'brain';
};

export const normalizePersonalityMode = normalizeExperience;

export type PersonalityModeId = ExperienceId;

export const EXPERIENCE_OPTIONS: ExperienceMeta[] = [
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

export const MODE_OPTIONS = EXPERIENCE_OPTIONS;

export const FACILITATED_MODE_OPTIONS: ExperienceMeta[] = EXPERIENCE_OPTIONS.filter(
  (option) => option.id !== 'brain',
);

export const EXPERIENCE_META = EXPERIENCE_OPTIONS.reduce<Record<ExperienceId, ExperienceMeta>>((acc, option) => {
  acc[option.id] = option;
  return acc;
}, {
  brain: EXPERIENCE_OPTIONS[0],
  game_master: EXPERIENCE_OPTIONS[1]
} as Record<ExperienceId, ExperienceMeta>);

export const MODE_META = EXPERIENCE_META;

export const getExperienceMeta = (exp?: string | null): ExperienceMeta => {
  const normalized = normalizeExperience(exp);
  return EXPERIENCE_META[normalized];
};

export const getModeMeta = getExperienceMeta;
