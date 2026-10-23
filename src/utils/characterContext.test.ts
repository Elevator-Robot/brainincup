import { describe, expect, it } from 'vitest';
import { canShowCharacterContext } from './characterContext';

describe('character creation context gate', () => {
  const saved = { id: 'hero-1', conversationId: 'adventure-1' };

  it('opens only for a saved character in the current adventure, after creation ends', () => {
    expect(canShowCharacterContext(saved, 'adventure-1', false)).toBe(true);
  });

  it('stays closed even if a record arrives while creation is still in progress', () => {
    expect(canShowCharacterContext(saved, 'adventure-1', true)).toBe(false);
  });

  it.each([null, undefined, {}, { conversationId: 'adventure-1' }])('stays closed for an absent or unsaved character: %j', character => {
    expect(canShowCharacterContext(character, 'adventure-1', false)).toBe(false);
  });

  it('does not leak an old adventure’s context into a new character flow', () => {
    expect(canShowCharacterContext(saved, 'adventure-2', false)).toBe(false);
    expect(canShowCharacterContext(saved, null, false)).toBe(false);
    expect(canShowCharacterContext({ id: 'hero-1' }, 'adventure-1', false)).toBe(false);
  });
});
