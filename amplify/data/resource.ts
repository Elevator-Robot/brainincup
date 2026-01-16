import { defineData, a } from '@aws-amplify/backend';
import { ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  Conversation: a.model({
    id: a.id(),
    title: a.string().default('New Interaction'),
    participants: a.string().array(),
    personalityMode: a.string().default('default'),
    messages: a.hasMany('Message', 'conversationId'),
    brainResponses: a.hasMany('BrainResponse', 'conversationId'),
    gameMasterAdventure: a.hasOne('GameMasterAdventure', 'conversationId'),
    createdAt: a.date(),
    updatedAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),

  Message: a.model({
    id: a.id(),
    conversationId: a.id(),
    conversation: a.belongsTo('Conversation', 'conversationId'),
    senderId: a.string(),
    content: a.string(),
    timestamp: a.date(),
    brainResponses: a.hasOne('BrainResponse', 'messageId')
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),

  BrainResponse: a.model({
    id: a.id(),
    conversationId: a.id(),
    conversation: a.belongsTo('Conversation', 'conversationId'),

    messageId: a.id(),
    message: a.belongsTo('Message', 'messageId'),

    response: a.string(),

    sensations: a.string().array(),
    thoughts: a.string().array(),
    memories: a.string(),
    selfReflection: a.string(),

    createdAt: a.date(),
    owner: a.string(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read']),
  ]),

  GameMasterAdventure: a.model({
    id: a.id(),
    conversationId: a.id(),
    conversation: a.belongsTo('Conversation', 'conversationId'),
    title: a.string().default('Untitled Adventure'),
    genre: a.string().default('Surreal Fantasy'),
    tone: a.string().default('Player-led'),
    difficulty: a.string().default('Story-first'),
    safetyLevel: a.string().default('User Directed'),
    moodTag: a.string().default('Unsettled'),
    lastLocation: a.string().default('Unknown'),
    lastStepId: a.string().default(''),
    questSteps: a.hasMany('GameMasterQuestStep', 'adventureId'),
    character: a.hasOne('GameMasterCharacter', 'adventureId'),
    owner: a.string(),
    createdAt: a.date(),
    updatedAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),

  GameMasterCharacter: a.model({
    id: a.id(),
    adventureId: a.id(),
    adventure: a.belongsTo('GameMasterAdventure', 'adventureId'),
    conversationId: a.id(),
    
    // Basic Info
    name: a.string().default('Adventurer'),
    race: a.string().default('Human'),
    characterClass: a.string().default('Wanderer'),
    level: a.integer().default(1),
    experience: a.integer().default(0),
    
    // Core Stats (D&D 5e style)
    strength: a.integer().default(10),
    dexterity: a.integer().default(12),
    constitution: a.integer().default(14),
    intelligence: a.integer().default(16),
    wisdom: a.integer().default(13),
    charisma: a.integer().default(11),
    
    // Derived Stats
    maxHP: a.integer().default(12),
    currentHP: a.integer().default(12),
    armorClass: a.integer().default(10),
    
    // JSON fields for complex data
    inventory: a.json(),
    skills: a.json(),
    statusEffects: a.json(),
    
    // Versioning for optimistic locking
    version: a.integer().default(1),
    
    createdAt: a.date(),
    updatedAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),

  GameMasterQuestStep: a.model({
    id: a.id(),
    adventureId: a.id(),
    adventure: a.belongsTo('GameMasterAdventure', 'adventureId'),
    conversationId: a.id(),
    brainResponseId: a.string().default(''),
    messageId: a.string().default(''),
    title: a.string().default(''),
    summary: a.string(),
    narration: a.string(),
    dangerLevel: a.string().default('Unknown'),
    locationTag: a.string().default(''),
    createdAt: a.date(),
    playerChoices: a.hasMany('GameMasterPlayerChoice', 'questStepId'),
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),

  GameMasterPlayerChoice: a.model({
    id: a.id(),
    questStepId: a.id(),
    questStep: a.belongsTo('GameMasterQuestStep', 'questStepId'),
    conversationId: a.id(),
    messageId: a.id(),
    content: a.string(),
    toneTag: a.string().default('neutral'),
    createdAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(['Admins'])]),
});

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

// export type Schema = typeof schema;
export type Schema = ClientSchema<typeof schema>;
