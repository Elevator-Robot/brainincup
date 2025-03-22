import { defineData, a } from "@aws-amplify/backend";
import { ClientSchema } from "@aws-amplify/backend";

const schema = a.schema({
  Conversation: a.model({
    id: a.id(),
    participants: a.string().array(),
    messages: a.hasMany("Message", "conversationId"), // Corrected with explicit reference key
    createdAt: a.date(),
    updatedAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(["Admins"])]),

  Message: a.model({
    id: a.id(),
    conversationId: a.id(), // Explicit foreign key reference for one-to-many relationship
    conversation: a.belongsTo("Conversation", "conversationId"), // Corrected to explicitly reference the parent
    senderId: a.string(),
    content: a.string(),
    timestamp: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(["Admins"])]),

  BrainResponse: a.model({
    id: a.id(),
    conversationId: a.id(),
    conversation: a.belongsTo("Conversation", "conversationId"),

    messageId: a.id(), // the user message this is responding to
    message: a.belongsTo("Message", "messageId"),

    response: a.string(), // the actual AI response (text)

    sensations: a.string().array(),
    thoughts: a.string().array(),
    memories: a.string(), // could later link to a Memory model
    selfReflection: a.string(),

    createdAt: a.date(),
  }).authorization(allow => [allow.owner(), allow.groups(["Admins"])]),
});

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});

// export type Schema = typeof schema;
export type Schema = ClientSchema<typeof schema>;
/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
//
