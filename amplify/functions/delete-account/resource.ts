import { defineFunction } from '@aws-amplify/backend';

export const deleteAccount = defineFunction({
  name: 'delete-account',
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
