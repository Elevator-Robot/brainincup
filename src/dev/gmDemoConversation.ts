import type { Schema } from '../../amplify/data/resource';
import type { Message } from '../components/MessageBubble';
import type { Quest } from '../components/ContextWindowPanel';

type AdventureRecord = Schema['GameMasterAdventure']['type'];
type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
type CharacterRecord = Schema['GameMasterCharacter']['type'];

/**
 * DEV-ONLY fixture used by test mode (`?testmode=true`).
 *
 * Test mode never reaches AppSync, so the workspace would otherwise render an
 * empty Game Master shell. This gives the real workspace — rail, chat, context
 * window, options menu — a complete adventure to review against.
 */
export const DEMO_CONVERSATION_ID = 'test-conversation-2';
export const DEMO_CONVERSATION_TITLE = 'The Missing Constellation';
export const DEMO_LOCATION = 'Starfall Observatory';

const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

export const demoMessages: Message[] = [
  {
    role: 'assistant',
    content:
      'The last tram leaves you on the ridge below **Starfall Observatory**. Violet cloud drifts sideways against the wind, and somewhere above, a bell rings once.\n\nA woman waits beside the door with a silver lantern cupped in both hands. “You came,” she says. “I am Mira. Three nights ago, seven stars went out. Tonight they started calling back.”',
    sensations: ['Rain on stone. A solitary bell above the ridge.', 'The silver lantern gives the dark a place to gather.'],
    thoughts: ['Mira seems to have been waiting for someone, though whether she expected you is less certain.'],
    memories: 'Mira says seven stars disappeared three nights ago.',
    selfReflection: 'An invitation can sound remarkably like a warning.',
    populateOnMount: true,
  },
  { role: 'user', content: '“Calling back how?” I keep my hands where she can see them.' },
  {
    role: 'assistant',
    content:
      'Mira lifts the lantern. Inside it, no flame — only a small, patient darkness that turns to face you.\n\n“Like this,” she says. “Every night, one more of them speaks. Last night it was **Vega**. It said my name.”\n\n- The observatory door stands ajar, warm light spilling onto wet stone.\n- Fresh boot prints cross the path and stop at the threshold — they never come back out.\n- Far below, the tram lights gutter and go dark one car at a time.',
  },
  { role: 'user', content: 'I ask what the voice sounded like, and whether anyone else has heard it.' },
  {
    role: 'assistant',
    content:
      '“Like wind through a keyhole,” Mira says. “And no. The other astronomers left when the first star went out. I stayed because the telescope still tracks something up there.”\n\nShe steps aside. The door swings wider than the wind should allow.\n\n> *Perception check — the prints by the door are too narrow for a boot, and they are wet in a way the rain cannot explain.*',
  },
  { role: 'user', content: 'I crouch by the prints and look closely, then follow them inside.' },
  {
    role: 'assistant',
    content:
      'The prints are bare feet, and they are **warm**. They lead through the entry hall, past a coat rack heavy with dust, and stop at the base of the spiral stair.\n\nThe hall smells of ozone and cold iron. Above you, the great telescope creaks as it turns — slowly, deliberately, tracking a patch of sky where nothing is visible.\n\nA chalkboard on the wall reads, in a hurried hand:\n\n1. Seven gone.\n2. Six returned.\n3. ~~Do not answer~~ *Do not answer first.*',
  },
  { role: 'user', content: '“Mira, what happens if I answer first?”' },
  {
    role: 'assistant',
    content:
      'She does not look at you. “The last person who did is still up there. I hear him some nights, correcting my arithmetic.”\n\nThe lantern in her hands dims. From the dome above comes a soft, patient knock — three times, from the inside.\n\n**Mira:** “The stair only opens for one of us at a time. I will not think less of you if you take the daylight road back to the tram.”',
  },
  { role: 'user', content: 'I take the lantern and start up the stair.' },
  {
    role: 'assistant',
    content:
      'The stair turns tighter than the tower should allow. With every step the air grows colder, and the lantern’s darkness grows heavier — until it is a small round weight you have to carry with both hands.\n\nAt the top, the dome opens onto a room full of sky. Six stars hang **too low**, close enough to see their edges. The seventh is a hole shaped like a person.\n\nA chair sits beneath the telescope. Someone is in it, writing. They have not noticed you yet.',
    sensations: ['Cold air settles on your hands; the lantern pulls against them.', 'Six low stars illuminate an occupied chair.'],
    thoughts: ['The quiet seems less like abandonment than a conversation not yet begun.'],
    memories: 'Mira warned you not to answer the voice first. The chalkboard read: seven gone, six returned.',
    selfReflection: 'For now, the room leaves the next word to you.',
  },
];

const inventory = JSON.stringify([
  { id: 'inv-shortsword', name: 'Shortsword', type: 'weapon', quantity: 1, equipped: true },
  { id: 'inv-dagger', name: 'Dagger', type: 'weapon', quantity: 2 },
  { id: 'inv-leather', name: 'Leather Armor', type: 'armor', quantity: 1, equipped: true },
  { id: 'inv-tools', name: 'Thieves\' Tools', type: 'consumable', quantity: 1 },
  { id: 'inv-lantern', name: 'Mira\'s Lantern', type: 'quest', quantity: 1, description: 'No flame. Something inside is listening.' },
]);

export const demoCharacter = {
  id: 'demo-character',
  adventureId: 'demo-adventure',
  conversationId: DEMO_CONVERSATION_ID,
  name: 'Sera Vane',
  race: 'Halfling',
  characterClass: 'Rogue',
  avatarId: 'halfling-01',
  level: 2,
  experience: 180,
  strength: 9,
  dexterity: 16,
  constitution: 13,
  intelligence: 12,
  wisdom: 14,
  charisma: 15,
  maxHP: 15,
  currentHP: 11,
  armorClass: 14,
  inventory,
  skills: JSON.stringify({ stealth: 5, perception: 4, insight: 3 }),
  statusEffects: JSON.stringify([]),
  version: 1,
  createdAt: at(240),
  updatedAt: at(4),
} as unknown as CharacterRecord;

export const demoAdventure = {
  id: 'demo-adventure',
  conversationId: DEMO_CONVERSATION_ID,
  title: DEMO_CONVERSATION_TITLE,
  genre: 'Surreal Fantasy',
  tone: 'Player-led',
  difficulty: 'Story-first',
  safetyLevel: 'User Directed',
  moodTag: 'Unsettled',
  currentLocation: DEMO_LOCATION,
  lastLocation: DEMO_LOCATION,
  currentScene: 'The open dome, six low stars, and the astronomer in the chair.',
  currentAct: 'RISING_ACTION',
  currentChapter: 1,
  tensionLevel: 5,
  lastStepId: 'demo-step-3',
  createdAt: at(240),
  updatedAt: at(4),
} as unknown as AdventureRecord;

export const demoQuestSteps = [
  {
    id: 'demo-step-1',
    adventureId: 'demo-adventure',
    conversationId: DEMO_CONVERSATION_ID,
    summary: 'Reached Starfall Observatory and met Mira.',
    narration: 'Mira explains that seven stars vanished three nights ago.',
    dangerLevel: 'low',
    locationTag: DEMO_LOCATION,
    createdAt: at(180),
  },
  {
    id: 'demo-step-2',
    adventureId: 'demo-adventure',
    conversationId: DEMO_CONVERSATION_ID,
    summary: 'Traced the warm footprints to the spiral stair.',
    narration: 'The prints stop at the stair; the chalkboard warns not to answer first.',
    dangerLevel: 'medium',
    locationTag: DEMO_LOCATION,
    createdAt: at(90),
  },
  {
    id: 'demo-step-3',
    adventureId: 'demo-adventure',
    conversationId: DEMO_CONVERSATION_ID,
    summary: 'Climbed into the open dome with the lantern.',
    narration: 'Six stars hang too low; a seventh is a hole shaped like a person.',
    dangerLevel: 'high',
    locationTag: DEMO_LOCATION,
    createdAt: at(4),
  },
] as unknown as QuestStepRecord[];

export const demoQuests: Quest[] = [
  {
    id: 'quest-constellation',
    title: 'The Missing Constellation',
    currentStep: 'Confront the astronomer in the chair.',
    stepProgress: '3 / 5',
    isNew: true,
  },
  {
    id: 'quest-lantern',
    title: 'Mira’s Lantern',
    currentStep: 'Do not answer the voice first.',
    stepProgress: '1 / 3',
  },
];

const replies = [
  'The astronomer sets down the pen without turning around. “You are late,” they say. “Or early. The sky is not particular.”\n\nBehind them, the seventh star — the hole shaped like a person — widens by a finger’s width.',
  'Your lantern grows heavier. Inside it, the small darkness presses against the glass, toward the open dome.\n\nMira’s voice comes up the stair, thin and careful: “Whatever it offers you, ask what it took.”',
  'Six stars tilt toward you at once. Their light is cold enough to fog your breath, and each one is humming a different note of the same chord.\n\nThe chair creaks. Its occupant is still writing.',
  'The chalkboard downstairs rewrites itself — you can hear the chalk moving, three floors below.\n\n**New line:** *Seven gone. Six returned. One is still choosing.*',
  'A gust crosses the dome, carrying the smell of rain and hot iron. For one heartbeat the telescope points directly at you.\n\nThe astronomer finally turns their head.',
  'Somewhere in the tower, the bell rings a second time. The darkness in your lantern answers it.\n\nYou have the distinct sense that the next words spoken in this room will matter more than the last hundred.',
];

let replyIndex = 0;

/** Deterministic canned GM response for test-mode chat. */
export const buildGmDemoReply = (content: string): string => {
  const input = content.toLowerCase();
  if (input.includes('inventory') || input.includes('pack')) {
    return 'In your pack: a shortsword, two daggers, leather armor, thieves’ tools — and **Mira’s lantern**, which has grown warm since you entered the dome.';
  }
  if (input.includes('quest') || input.includes('objective')) {
    return 'Your next task is to confront the astronomer in the chair before the seventh star finishes opening.';
  }
  const reply = replies[replyIndex % replies.length];
  replyIndex += 1;
  return reply;
};

/** Authored, player-visible annotations for the local narrator demo. */
export const buildGmDemoMessage = (content: string): Message => {
  const reply = buildGmDemoReply(content);
  return {
    role: 'assistant', content: reply,
    sensations: [reply.split('\n\n')[0].replace(/\*\*/g, '').slice(0, 280)],
    thoughts: [/inventory|pack/i.test(content)
      ? 'The lantern makes familiar equipment feel a little less familiar.'
      : /quest|objective/i.test(content)
        ? 'The unfinished constellation has become a reason to act, not an answer.'
        : 'The room offers an invitation and a warning in the same breath.'],
    memories: 'Mira’s warning: do not answer first.',
    selfReflection: 'The next move belongs to you.',
  };
};
