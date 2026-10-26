import type { ChatComposerConfiguration } from './presentation';
import { BRAIN_ACTIONS, GAME_MASTER_ACTIONS, quickActionsForMode } from '../utils/chatActions';
import { predictCompletion } from '../utils/composerPredictions';

export const BRAIN_CHAT: ChatComposerConfiguration = {
  actions: BRAIN_ACTIONS, quickActions: [], inputLabel: 'Message Brain',
  suggestCompletion: draft => predictCompletion(draft, false),
};

export const GAME_MASTER_CHAT: ChatComposerConfiguration = {
  actions: GAME_MASTER_ACTIONS, quickActions: quickActionsForMode(true), inputLabel: 'Your next action',
  suggestCompletion: draft => predictCompletion(draft, true),
};
