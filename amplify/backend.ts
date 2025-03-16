import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { brain } from './functions/brain/resource';
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam"

const backend = defineBackend({
  auth,
  data,
  brain,
});

const brainLambda = backend.brain.resources.lambda;

brainLambda.addToRolePolicy(new PolicyStatement({
  actions: ['bedrock:*'],
  resources: ['*'],
  effect: Effect.ALLOW,
}));

export default backend;

