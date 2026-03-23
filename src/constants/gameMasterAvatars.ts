export type PlayableRaceKey = 'goblin' | 'troll' | 'terran' | 'elvin' | 'halfling' | 'orc' | 'halforc';

export type CharacterAvatarOption = {
  id: string;
  label: string;
  src: string;
  race: PlayableRaceKey;
  classTag?: string;
};

const AVATAR_FILE_NAMES_FALLBACK = [
  'elvin-01.png',
  'elvin-02.png',
  'elvin-03.png',
  'elvin-04.png',
  'elvin-05.png',
  'elvin-06.png',
  'goblin-01.png',
  'goblin-02.png',
  'goblin-03.png',
  'orc-01.png',
  'orc-02.png',
  'orc-03.png',
  'orc-04.png',
  'orc-05.png',
  'orc-06.png',
  'terran-01.png',
  'terran-02.png',
  'terran-03.png',
  'terran-04.png',
  'terran-05.png',
  'terran-06.png',
  'troll-01.png',
  'troll-02.png',
  'troll-03.png',
  'troll-04.png',
] as const;

const AVATAR_IMAGE_MODULES = import.meta.glob('/public/images/avatars/*.{png,jpg,jpeg,webp,avif,svg}');

const AVATAR_FILE_NAMES = (
  Object.keys(AVATAR_IMAGE_MODULES)
    .map((path) => path.split('/').pop() ?? '')
    .filter((fileName): fileName is string => fileName.length > 0)
);

const RACE_LABELS: Record<PlayableRaceKey, string> = {
  goblin: 'Goblin',
  troll: 'Troll',
  terran: 'Terran',
  elvin: 'Elvin',
  halfling: 'Halfling',
  orc: 'Orc',
  halforc: 'Half-Orc',
};

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

const allowedRaces: ReadonlySet<PlayableRaceKey> = new Set([
  'goblin',
  'troll',
  'terran',
  'elvin',
  'halfling',
  'orc',
  'halforc',
]);

const RACE_ALIAS: Record<string, PlayableRaceKey> = {
  terrans: 'terran',
  human: 'terran',
  elf: 'elvin',
  halforc: 'halforc',
};

const normalizeRaceKey = (race: string | null | undefined): PlayableRaceKey | null => {
  const raceKey = toKey(race);
  const normalized = RACE_ALIAS[raceKey] ?? raceKey;
  return allowedRaces.has(normalized as PlayableRaceKey) ? (normalized as PlayableRaceKey) : null;
};

const AVATAR_FILE_PATTERN = /^([a-z0-9]+)(?:-([a-z0-9-]+))?-(\d{1,3})\.(png|jpe?g|webp|avif|svg)$/i;

type ParsedAvatar = CharacterAvatarOption & { order: number };

const parseAvatarFileName = (fileName: string): ParsedAvatar | null => {
  const match = fileName.match(AVATAR_FILE_PATTERN);
  if (!match) return null;

  const [, raceRaw, classTagRaw, orderRaw] = match;
  const race = normalizeRaceKey(raceRaw);
  if (!race) return null;

  const order = Number.parseInt(orderRaw, 10);
  if (!Number.isFinite(order)) return null;

  const classTag = classTagRaw ? toKey(classTagRaw) : undefined;
  const orderId = order.toString().padStart(2, '0');
  const idBase = `${race}-${orderId}`;
  const label = `${RACE_LABELS[race]} ${order}`;

  return {
    id: classTag ? `${idBase}-${classTag}` : idBase,
    label: classTag ? `${label} (${classTag})` : label,
    src: `/images/avatars/${fileName}`,
    race,
    classTag,
    order,
  };
};

export const CHARACTER_AVATAR_OPTIONS: CharacterAvatarOption[] = AVATAR_FILE_NAMES
  .concat(AVATAR_FILE_NAMES.length > 0 ? [] : [...AVATAR_FILE_NAMES_FALLBACK])
  .map(parseAvatarFileName)
  .filter((value): value is ParsedAvatar => value !== null)
  .sort((a, b) => {
    if (a.race !== b.race) return a.race.localeCompare(b.race);
    if (a.order !== b.order) return a.order - b.order;
    return (a.classTag ?? '').localeCompare(b.classTag ?? '');
  })
  .map((option) => ({
    id: option.id,
    label: option.label,
    src: option.src,
    race: option.race,
    classTag: option.classTag,
  }));

export const DEFAULT_CHARACTER_AVATAR_ID = CHARACTER_AVATAR_OPTIONS.find((option) => option.race === 'terran')?.id
  ?? CHARACTER_AVATAR_OPTIONS[0]?.id
  ?? '';

const LEGACY_AVATAR_ID_ALIAS: Record<string, string> = {
  goblin1: 'goblin-01',
  goblin2: 'goblin-02',
  goblin3: 'goblin-03',
  troll1: 'troll-01',
  troll2: 'troll-02',
  troll3: 'troll-03',
  orc1: 'orc-01',
  'terran-wanderer-01': 'terran-01',
  'terran-wanderer-02': 'terran-02',
  'terran-wanderer-03': 'terran-03',
  'terran-mage-01': 'terran-04',
  'terran-mage-02': 'terran-05',
  'terran-mage-03': 'terran-06',
  elf1: 'elvin-01',
  elf2: 'elvin-02',
  elf3: 'elvin-03',
  elf4: 'elvin-04',
  elf5: 'elvin-05',
  elf6: 'elvin-06',
  'elf-01': 'elvin-01',
  'elf-02': 'elvin-02',
  'elf-03': 'elvin-03',
  'elf-04': 'elvin-04',
  'elf-05': 'elvin-05',
  'elf-06': 'elvin-06',
  wizard1: 'terran-01',
  wizard2: 'terran-02',
  wizard3: 'terran-03',
  witch1: 'terran-04',
  witch2: 'terran-05',
  witch3: 'terran-06',
};

const resolveAvatarId = (avatarId: string): string => LEGACY_AVATAR_ID_ALIAS[avatarId] ?? avatarId;

export const getAvatarOptionsForRace = (race: string | null | undefined): CharacterAvatarOption[] => {
  const raceKey = normalizeRaceKey(race);
  if (!raceKey) return [];
  return CHARACTER_AVATAR_OPTIONS.filter((option) => option.race === raceKey);
};

export const chooseAutoAvatarId = (input: {
  name?: string | null;
  race?: string | null;
  characterClass?: string | null;
}): string => {
  const options = getAvatarOptionsForRace(input.race);
  if (options.length === 0) return '';
  const seed = `${toKey(input.name)}-${toKey(input.race)}-${toKey(input.characterClass)}`;
  return options[hashString(seed) % options.length].id;
};

export const getAvatarOptionById = (avatarId: string): CharacterAvatarOption | undefined =>
  CHARACTER_AVATAR_OPTIONS.find((option) => option.id === resolveAvatarId(avatarId));

export const getAvatarSrcById = (avatarId: string): string =>
  getAvatarOptionById(avatarId)?.src ?? getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID)?.src ?? '';
