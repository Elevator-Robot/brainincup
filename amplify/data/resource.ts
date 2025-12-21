import { defineData, a } from '@aws-amplify/backend';
import { ClientSchema } from '@aws-amplify/backend';

const schema = a.schema({
  Conversation: a.model({
    id: a.id(),
    title: a.string().default('New Conversation'),
    participants: a.string().array(),
    personalityMode: a.string().default('default'), // 'default' or 'rpg_dm'
    messages: a.hasMany('Message', 'conversationId'),
    brainResponses: a.hasMany('BrainResponse', 'conversationId'),
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

    messageId: a.id(), // the user message this is responding to
    message: a.belongsTo('Message', 'messageId'),

    response: a.string(),

    sensations: a.string().array(),
    thoughts: a.string().array(),
    memories: a.string(), // could later link to a Memory model
    selfReflection: a.string(),

    createdAt: a.date(),
    owner: a.string(),
  }).authorization(allow => [
    allow.owner(),
    allow.authenticated().to(['read']),
  ]),
});

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

// export type Schema = typeof schema;
export type Schema = ClientSchema<typeof schema>;
