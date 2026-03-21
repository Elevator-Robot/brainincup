type AvatarGroup = 'goblin' | 'witch' | 'wizard' | 'troll';

export type CharacterAvatarOption = {
  id: string;
  label: string;
  src: string;
  group: AvatarGroup;
};

const avatarGroups: Record<AvatarGroup, CharacterAvatarOption[]> = {
  goblin: [
    { id: 'goblin1', label: 'Goblin Scout I', src: '/images/avatars/arcane-kitchen/goblin1.png', group: 'goblin' },
    { id: 'goblin2', label: 'Goblin Scout II', src: '/images/avatars/arcane-kitchen/goblin2.png', group: 'goblin' },
    { id: 'goblin3', label: 'Goblin Scout III', src: '/images/avatars/arcane-kitchen/goblin3.png', group: 'goblin' },
  ],
  witch: [
    { id: 'witch1', label: 'Witch Adept I', src: '/images/avatars/arcane-kitchen/witch1.png', group: 'witch' },
    { id: 'witch2', label: 'Witch Adept II', src: '/images/avatars/arcane-kitchen/witch2.png', group: 'witch' },
    { id: 'witch3', label: 'Witch Adept III', src: '/images/avatars/arcane-kitchen/witch3.png', group: 'witch' },
  ],
  wizard: [
    { id: 'wizard1', label: 'Wizard Archivist I', src: '/images/avatars/arcane-kitchen/wizard1.png', group: 'wizard' },
    { id: 'wizard2', label: 'Wizard Archivist II', src: '/images/avatars/arcane-kitchen/wizard2.png', group: 'wizard' },
    { id: 'wizard3', label: 'Wizard Archivist III', src: '/images/avatars/arcane-kitchen/wizard3.png', group: 'wizard' },
  ],
  troll: [
    { id: 'troll1', label: 'Troll Vanguard I', src: '/images/avatars/arcane-kitchen/troll1.png', group: 'troll' },
    { id: 'troll2', label: 'Troll Vanguard II', src: '/images/avatars/arcane-kitchen/troll2.png', group: 'troll' },
    { id: 'troll3', label: 'Troll Vanguard III', src: '/images/avatars/arcane-kitchen/troll3.png', group: 'troll' },
  ],
};

export const CHARACTER_AVATAR_OPTIONS: CharacterAvatarOption[] = Object.values(avatarGroups).flat();
export const DEFAULT_CHARACTER_AVATAR_ID = 'wizard1';

const toKey = (value: string | null | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickGroup = (characterClass: string, race: string): AvatarGroup => {
  const classKey = toKey(characterClass);
  const raceKey = toKey(race);

  if (['wizard', 'sorcerer', 'warlock', 'cleric', 'druid'].includes(classKey)) return 'wizard';
  if (['bard', 'rogue', 'monk'].includes(classKey)) return 'witch';
  if (['barbarian', 'fighter', 'paladin'].includes(classKey)) return 'troll';
  if (['ranger'].includes(classKey)) return 'goblin';
  if (['gnome', 'halfling'].includes(raceKey)) return 'goblin';
  if (['halforc', 'dragonborn', 'dwarf'].includes(raceKey)) return 'troll';
  if (['tiefling', 'elf', 'halfelf'].includes(raceKey)) return 'witch';
  return 'wizard';
};

export const chooseAutoAvatarId = (input: {
  name?: string | null;
  race?: string | null;
  characterClass?: string | null;
}): string => {
  const group = pickGroup(input.characterClass ?? '', input.race ?? '');
  const options = avatarGroups[group];
  if (options.length === 0) return DEFAULT_CHARACTER_AVATAR_ID;
  const seed = `${toKey(input.name)}-${toKey(input.race)}-${toKey(input.characterClass)}`;
  return options[hashString(seed) % options.length].id;
};

export const getAvatarOptionById = (avatarId: string): CharacterAvatarOption | undefined =>
  CHARACTER_AVATAR_OPTIONS.find((option) => option.id === avatarId);

export const getAvatarSrcById = (avatarId: string): string =>
  getAvatarOptionById(avatarId)?.src ?? getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID)?.src ?? '/images/avatars/arcane-kitchen/wizard1.png';
