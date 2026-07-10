export type PlayableRaceKey = 'goblin' | 'troll' | 'terran' | 'elvin' | 'halfling' | 'orc' | 'halforc';

export type CharacterAvatarOption = {
  id: string;
  label: string;
  src: string;
  srcWebp: string;
  srcThumbnail: string;
  srcMedium: string;
  race: PlayableRaceKey;
  classTag?: string;
};

let cachedImageCDNUrl: string | null = null;

const getImageCDNUrl = (): string => {
  if (cachedImageCDNUrl !== null) {
    return cachedImageCDNUrl;
  }

  try {
    const outputs = (window as unknown as { __AMPLIFY_OUTPUTS__?: { custom?: { imageCDNUrl?: string } } }).__AMPLIFY_OUTPUTS__;
    const cdnUrl = outputs?.custom?.imageCDNUrl;
    if (cdnUrl && typeof cdnUrl === 'string' && cdnUrl.startsWith('https://')) {
      cachedImageCDNUrl = cdnUrl;
      return cdnUrl;
    }
  } catch {
    // Ignore errors reading from window
  }

  cachedImageCDNUrl = '';
  return '';
};

const buildAvatarSrc = (fileName: string): string => {
  const cdnUrl = getImageCDNUrl();
  if (cdnUrl) {
    return `${cdnUrl}/avatars/${fileName}`;
  }
  return `/images/avatars/${fileName}`;
};

const buildAvatarSrcThumbnail = (fileName: string): string => {
  const cdnUrl = getImageCDNUrl();
  const baseName = fileName.replace(/\.webp$/i, '');
  if (cdnUrl) {
    return `${cdnUrl}/avatars/thumbnails/${baseName}.webp`;
  }
  return `/images/avatars/thumbnails/${baseName}.webp`;
};

const buildAvatarSrcMedium = (fileName: string): string => {
  const cdnUrl = getImageCDNUrl();
  const baseName = fileName.replace(/\.webp$/i, '');
  if (cdnUrl) {
    return `${cdnUrl}/avatars/medium/${baseName}.webp`;
  }
  return `/images/avatars/medium/${baseName}.webp`;
};

const AVATAR_FILE_NAMES = [
  'elvin-01.webp',
  'elvin-02.webp',
  'elvin-03.webp',
  'elvin-04.webp',
  'elvin-05.webp',
  'elvin-06.webp',
  'goblin-01.webp',
  'goblin-02.webp',
  'goblin-03.webp',
  'halfling-01.webp',
  'halfling-02.webp',
  'halfling-03.webp',
  'halfling-04.webp',
  'halfling-05.webp',
  'halfling-06.webp',
  'orc-01.webp',
  'orc-02.webp',
  'orc-03.webp',
  'orc-04.webp',
  'orc-05.webp',
  'orc-06.webp',
  'terran-01.webp',
  'terran-02.webp',
  'terran-03.webp',
  'terran-04.webp',
  'terran-05.webp',
  'terran-06.webp',
  'terran-07.webp',
  'troll-01.webp',
  'troll-02.webp',
  'troll-03.webp',
  'troll-04.webp',
  'troll-05.webp',
  'troll-06.webp',
] as const;

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

const AVATAR_FILE_PATTERN = /^([a-z0-9]+)(?:-([a-z0-9-]+))?-(\d{1,3})\.webp$/i;

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

  const webpSrc = buildAvatarSrc(fileName);

  return {
    id: classTag ? `${idBase}-${classTag}` : idBase,
    label: classTag ? `${label} (${classTag})` : label,
    src: webpSrc,
    srcWebp: webpSrc,
    srcThumbnail: buildAvatarSrcThumbnail(fileName),
    srcMedium: buildAvatarSrcMedium(fileName),
    race,
    classTag,
    order,
  };
};

export const CHARACTER_AVATAR_OPTIONS: CharacterAvatarOption[] = AVATAR_FILE_NAMES
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
    srcWebp: option.srcWebp,
    srcThumbnail: option.srcThumbnail,
    srcMedium: option.srcMedium,
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

export const getAvatarWebpSrcById = (avatarId: string): string =>
  getAvatarOptionById(avatarId)?.srcWebp ?? getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID)?.srcWebp ?? '';

export const getAvatarThumbnailSrcById = (avatarId: string): string =>
  getAvatarOptionById(avatarId)?.srcThumbnail ?? getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID)?.srcThumbnail ?? '';

export const getAvatarMediumSrcById = (avatarId: string): string =>
  getAvatarOptionById(avatarId)?.srcMedium ?? getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID)?.srcMedium ?? '';
