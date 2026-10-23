import type { SVGProps } from 'react';

const PATHS: Record<string, string> = {
  fighter: 'M15 3l6 6-9 9-6-6 9-9ZM4 14l6 6M3 21l4-4M16 4l4 4',
  wizard: 'm5 20 10-10M13 3v4M11 5h4M19 12v4M17 14h4M16 8l2-2M4 9v4M2 11h4',
  rogue: 'm7 3 10 5-3 7-6 6 1-8-2-10ZM9 13l5 2M10 10l5-1',
  cleric: 'M12 3v18M5 9h14M8 3h8M8 21h8',
  ranger: 'M5 3c15 0 15 18 0 18M5 3l5 9-5 9M3 12h18M18 9l3 3-3 3',
  paladin: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4ZM12 7v10M8 11h8',
  barbarian: 'M5 21 16 3M7 3c0 7 7 11 14 8L16 3c-3 2-6 2-9 0ZM3 18l5 3',
  bard: 'M9 18V5l11-2v12M9 9l11-2M9 18c0 4-6 4-6 1s6-4 6-1ZM20 15c0 4-6 4-6 1s6-4 6-1Z',
  druid: 'M20 3C5 2 1 13 8 18c7 5 14-3 12-15ZM5 22 17 7M10 16v-5M10 16h5',
  monk: 'M12 3v3M6 8l6 3 6-3M12 11l-2 6-6 4M12 11l4 5 4 1M10 17l6 4',
  sorcerer: 'M13 2 4 14h7l-1 8 10-13h-7l1-7Z',
  warlock: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  wanderer: 'M12 2 3 21l9-4 9 4-9-19ZM12 8v9',
  person: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0ZM4 22v-3a8 8 0 0 1 16 0v3',
  heart: 'M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 2 11 8 16 6-5 13-11 8-16Z',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  back: 'M20 12H4M10 6l-6 6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  pack: 'M7 8V6a5 5 0 0 1 10 0v2M5 8h14v14H5V8ZM9 13h6v5H9v-5Z',
  strength: 'M7 7h10v10H7V7ZM3 9v6M21 9v6M1 12h6M17 12h6',
  dexterity: 'm13 2-8 12h7l-1 8 8-12h-7l1-8Z',
  constitution: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z',
  intelligence: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4ZM12 6v16',
  wisdom: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  charisma: 'm3 7 5 4 4-8 4 8 5-4-2 12H5L3 7ZM5 22h14',
  speed: 'M13 3 8 12h7l-5 9M3 6h5M2 11h3M3 16h4',
};

export default function CreationGlyph({ kind, ...props }: SVGProps<SVGSVGElement> & { kind: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
    <path d={PATHS[kind] ?? PATHS.spark} />
  </svg>;
}
