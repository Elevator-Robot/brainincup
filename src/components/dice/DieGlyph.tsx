import type { DieKind } from '../../game/dice';

const paths: Record<DieKind, { outline: string; edges: string }> = {
  4: { outline: 'M60 8 111 104H9L60 8Z', edges: 'M60 8v65M9 104l51-31 51 31' },
  6: { outline: 'm60 7 47 26v54l-47 26L13 87V33L60 7Z', edges: 'm13 33 47 27 47-27M60 60v53' },
  8: { outline: 'm60 5 49 55-49 55L11 60 60 5Z', edges: 'm11 60 49-15 49 15-49 15-49-15ZM60 5V45m0 30v40' },
  10: { outline: 'm60 5 46 39-8 40-38 31-38-31-8-40L60 5Z', edges: 'M60 5 35 49l25 21 25-21L60 5ZM14 44l21 5-13 35m84-40-21 5 13 35M35 49l25 66 25-66' },
  12: { outline: 'm38 7 44 0 31 36-10 46-43 25-43-25L7 43 38 7Z', edges: 'm60 30 29 21-11 34H42L31 51l29-21ZM38 7l22 23L82 7m31 36-24 8 14 38-25-4-18 29-18-29-25 4 14-38L7 43' },
  20: { outline: 'm60 5 47 28v54l-47 28L13 87V33L60 5Z', edges: 'M60 5 32 42h56L60 5ZM13 33l19 9-9 40-10 5m94-54-19 9 9 40 10 5M23 82l37 33 37-33M32 42l-9 40m65-40 9 40' },
  percentile: { outline: 'm60 5 46 39-8 40-38 31-38-31-8-40L60 5Z', edges: 'M60 5 35 49l25 21 25-21L60 5ZM14 44l21 5-13 35m84-40-21 5 13 35M35 49l25 66 25-66' },
};

export default function DieGlyph({ kind }: { kind: DieKind }) {
  return <svg className="cosmic-roll-die-shape" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <path className="cosmic-roll-die-face" d={paths[kind].outline} />
    <path className="cosmic-roll-die-edges" d={`${paths[kind].outline} ${paths[kind].edges}`} />
  </svg>;
}
