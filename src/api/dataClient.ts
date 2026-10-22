import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

/** Single Amplify Data client shared by the workspace and its queries. */
export const dataClient = generateClient<Schema>();
