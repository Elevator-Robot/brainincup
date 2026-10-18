import { afterEach, describe, expect, it, vi } from 'vitest';
import { DICE_SIDES, getVisualDice } from '../game/dice';
import { parseDiceRollRequest, rollDie } from './diceRolls';

afterEach(() => vi.restoreAllMocks());

describe('Brain-requested dice', () => {
  it('leaves every unrolled die blank, including both percentile dice', () => {
    for (const sides of DICE_SIDES) expect(getVisualDice(sides).every(die => die.value === undefined)).toBe(true);
  });

  it('preserves d20 compatibility and accepts an explicit die and purpose', () => {
    expect(parseDiceRollRequest({ requestId: 'legacy', statName: 'dexterity' })).toMatchObject({ sides: 20 });
    expect(parseDiceRollRequest({ requestId: 'damage', sides: 6, purpose: 'Dagger damage', modifier: 3 })).toMatchObject({ sides: 6, purpose: 'Dagger damage', modifier: 3 });
    expect(parseDiceRollRequest({ requestId: 'percentile', sides: 100, purpose: 'Wild magic' })).toMatchObject({ sides: 100 });
    for (const sides of [0, -6, 7, 1000, 'd6']) expect(parseDiceRollRequest({ requestId: 'invalid', sides })).toBeNull();
  });

  it.each(DICE_SIDES)('rolls d%i within its real range', sides => {
    for (let i = 0; i < 100; i++) {
      const value = rollDie(sides);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(sides);
    }
  });

  it('rejects the biased tail of the random integer range', () => {
    const values = [0xffffffff, 19];
    const original = crypto.getRandomValues.bind(crypto);
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
      if (array instanceof Uint32Array) { array[0] = values.shift() ?? 0; return array; }
      return original(array);
    });
    expect(rollDie(20)).toBe(20);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it.each([[1, '00', '1'], [49, '40', '9'], [90, '90', '0'], [100, '00', '0']])(
    'represents percentile %i with a real tens/units pair', (total, tens, units) => {
      const pair = getVisualDice(100, total as number);
      expect(pair.map(die => die.kind)).toEqual(['percentile', 10]);
      expect(pair.map(die => die.value)).toEqual([tens, units]);
    },
  );
});
