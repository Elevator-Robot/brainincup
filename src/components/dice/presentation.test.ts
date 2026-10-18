import { describe, expect, it } from 'vitest';
import { getDieNumberOpacity } from './presentation';

describe('die numeral reveal', () => {
  it('stays hidden briefly, then fades in without waiting for half the roll', () => {
    expect(getDieNumberOpacity(0)).toBe(0);
    expect(getDieNumberOpacity(299)).toBe(0);
    expect(getDieNumberOpacity(300)).toBe(0);
    expect(getDieNumberOpacity(390)).toBeCloseTo(.5);
    expect(getDieNumberOpacity(480)).toBe(1);
    expect(getDieNumberOpacity(2400)).toBe(1);
  });
});
