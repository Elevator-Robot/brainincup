import { describe, expect, it } from 'vitest';
import { BRAIN_ACTIONS, GAME_MASTER_ACTIONS } from './chatActions';
import { predictCompletion } from './composerPredictions';

describe('predictCompletion', () => {
  it('completes a known game-master opening', () => {
    expect(predictCompletion('I look', true)).toBe(' around carefully.');
    expect(predictCompletion('i look', true)).toBe(' around carefully.');
  });

  it('returns only the remaining tail once the prefix is typed', () => {
    expect(predictCompletion('I l', true)).toBe('ook around carefully.');
  });

  it('stays quiet until the player has typed enough to be sure', () => {
    expect(predictCompletion('', true)).toBe('');
    expect(predictCompletion('I', true)).toBe('');
  });

  it('stays quiet at a word boundary so it never fights the next word', () => {
    expect(predictCompletion('I look ', true)).toBe('');
  });

  it('stays quiet for multi-line drafts and slash commands', () => {
    expect(predictCompletion('I look\nand then', true)).toBe('');
    expect(predictCompletion('/lo', true)).toBe('');
  });

  it('suggests assistant phrasing outside game-master mode', () => {
    expect(predictCompletion('can you', false)).toBe(' explain that more simply?');
    expect(predictCompletion('can you', true)).toBe('');
  });

  it('never suggests a prefix that is not in the active bank', () => {
    for (const action of [...GAME_MASTER_ACTIONS, ...BRAIN_ACTIONS]) {
      expect(predictCompletion(action.command, true)).toBe('');
    }
  });
});
