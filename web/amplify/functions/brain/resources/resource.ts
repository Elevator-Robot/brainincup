import { defineFunction } from '@aws-amplify/backend';

export const brain = defineFunction({
  name: 'brain',
  entry: './handler.py',
  // runtime: 'python3.12',
});
