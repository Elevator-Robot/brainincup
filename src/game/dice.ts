export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DiceSides = typeof DICE_SIDES[number];
export type DieKind = Exclude<DiceSides, 100> | 'percentile';

export const DIE_STYLES: Record<DieKind, { label: string; shape: string; color: string; emissive: string; light: string }> = {
  4: { label: 'd4', shape: 'Tetrahedron', color: '#ed829b', emissive: '#9f2d58', light: '237 130 155' },
  6: { label: 'd6', shape: 'Cube', color: '#8bd4ad', emissive: '#196c50', light: '139 212 173' },
  8: { label: 'd8', shape: 'Octahedron', color: '#8dbdf0', emissive: '#284ba1', light: '141 189 240' },
  10: { label: 'd10', shape: 'Pentagonal trapezohedron', color: '#e3a3cc', emissive: '#963f7b', light: '227 163 204' },
  12: { label: 'd12', shape: 'Dodecahedron', color: '#b8c8ef', emissive: '#4a5eaa', light: '184 200 239' },
  20: { label: 'd20', shape: 'Icosahedron', color: '#9b83db', emissive: '#5b39d4', light: '155 131 219' },
  percentile: { label: 'd%', shape: 'Percentile tens', color: '#8ce2e9', emissive: '#207f99', light: '140 226 233' },
};

export interface VisualDie {
  id: string;
  kind: DieKind;
  label: string;
  value?: string;
}

export function isDiceSides(value: unknown): value is DiceSides {
  return typeof value === 'number' && (DICE_SIDES as readonly number[]).includes(value);
}

/** A percentile check uses real tens/units dice; 00 + 0 means 100. */
export function getVisualDice(sides: DiceSides, value?: number): VisualDie[] {
  if (sides === 100) return [
    { id: 'd100-tens', kind: 'percentile', label: 'tens', value: value === undefined ? undefined : String(Math.floor(value % 100 / 10) * 10).padStart(2, '0') },
    { id: 'd100-units', kind: 10, label: 'units', value: value === undefined ? undefined : String(value % 10) },
  ];
  return [{ id: `d${sides}`, kind: sides, label: `d${sides}`, value: value === undefined ? undefined : String(value) }];
}
