import { describe, expect, it } from 'vitest';
import {
  BRAIN_ACTIONS,
  GAME_MASTER_ACTIONS,
  actionsForMode,
  appendPrompt,
  filterActions,
  quickActionsForMode,
} from './chatActions';

describe('actionsForMode', () => {
  it('offers adventure verbs in game-master mode and assistant verbs otherwise', () => {
    expect(actionsForMode(true)).toBe(GAME_MASTER_ACTIONS);
    expect(actionsForMode(false)).toBe(BRAIN_ACTIONS);
  });
});

describe('quickActionsForMode', () => {
  it('keeps only the flat pill actions for game-master mode', () => {
    expect(quickActionsForMode(true).map(action => action.id)).toEqual(['look', 'talk', 'inventory', 'quests']);
  });

  it('has no pills outside game-master mode', () => {
    expect(quickActionsForMode(false)).toEqual([]);
  });
});

describe('filterActions', () => {
  it('returns every action for an empty query', () => {
    expect(filterActions(GAME_MASTER_ACTIONS, '')).toBe(GAME_MASTER_ACTIONS);
    expect(filterActions(GAME_MASTER_ACTIONS, '   ')).toBe(GAME_MASTER_ACTIONS);
  });

  it('matches command prefixes and label fragments case-insensitively', () => {
    // "ro" hits the /roll command and the "Look around" label.
    expect(filterActions(GAME_MASTER_ACTIONS, 'ro').map(action => action.command)).toEqual(['look', 'roll']);
    expect(filterActions(GAME_MASTER_ACTIONS, 'LO').map(action => action.command)).toEqual(['look']);
    expect(filterActions(GAME_MASTER_ACTIONS, 'qu').map(action => action.command)).toEqual(['quests']);
  });

  it('matches inside labels, so a partial word still finds the verb', () => {
    expect(filterActions(GAME_MASTER_ACTIONS, 'ventor').map(action => action.command)).toEqual(['inventory']);
  });

  it('returns nothing when the query matches no action', () => {
    expect(filterActions(GAME_MASTER_ACTIONS, 'teleport')).toEqual([]);
  });
});

describe('appendPrompt', () => {
  it('replaces an empty draft with the prompt', () => {
    expect(appendPrompt('', 'I look around.')).toBe('I look around.');
    expect(appendPrompt('   ', 'I look around.')).toBe('I look around.');
  });

  it('stages the prompt on the next line without losing the draft', () => {
    expect(appendPrompt('I raise my lantern.', 'I look around.')).toBe('I raise my lantern.\nI look around.');
  });

  it('does not add a blank line when the draft already ends in a newline', () => {
    expect(appendPrompt('I raise my lantern.\n', 'I look around.')).toBe('I raise my lantern.\nI look around.');
  });
});
