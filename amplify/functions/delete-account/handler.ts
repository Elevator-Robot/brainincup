import type { Schema } from '../../data/resource';
import AWS from 'aws-sdk';

type DeleteAccountHandler = Schema['deleteAccount']['functionHandler'];

const DATA_TABLE_ENV_KEYS = [
  'CONVERSATION_TABLE_NAME',
  'MESSAGE_TABLE_NAME',
  'RESPONSE_TABLE_NAME',
  'ADVENTURE_TABLE_NAME',
  'CHARACTER_TABLE_NAME',
  'QUEST_STEP_TABLE_NAME',
  'PLAYER_CHOICE_TABLE_NAME',
  'PLAYER_STATE_TABLE_NAME',
  'WORLD_STATE_TABLE_NAME',
  'ACTIVE_QUEST_TABLE_NAME',
];

const getIdentity = (event: unknown) => {
  const request = (event as { request?: { jwt?: { sub?: string; username?: string; claims?: Record<string, unknown> } } })
    .request ?? {};
  const jwt = request.jwt ?? {};
  const claims = jwt.claims ?? {};
  const username = jwt.username ?? (claims.username as string | undefined);
  const sub = jwt.sub ?? (claims.sub as string | undefined);
  return { username, sub };
};

const deleteDataForOwner = async (sub: string): Promise<void> => {
  const ddb = new AWS.DynamoDB({ region: process.env.AWS_REGION });

  for (const envKey of DATA_TABLE_ENV_KEYS) {
    const tableName = process.env[envKey];
    if (!tableName) continue;

    let exclusiveStartKey: AWS.DynamoDB.Key | undefined;
    let deleted = 0;

    do {
      const result = await ddb
        .scan({
          TableName: tableName,
          FilterExpression: '#owner = :sub',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: { ':sub': { S: sub } },
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        })
        .promise();

      exclusiveStartKey = result.LastEvaluatedKey as AWS.DynamoDB.Key | undefined;

      for (const item of result.Items ?? []) {
        if (!item.id) continue;
        await ddb
          .deleteItem({ TableName: tableName, Key: { id: item.id } })
          .promise();
        deleted += 1;
      }
    } while (exclusiveStartKey);

    console.log(`deleteAccount: removed ${deleted} items from ${tableName}`);
  }
};

export const handler: DeleteAccountHandler = async (event) => {
  const { username, sub } = getIdentity(event);

  if (!username || !sub) {
    throw new Error('Unable to identify the authenticated user.');
  }

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    throw new Error('User pool is not configured.');
  }

  // 1. Delete the Cognito user so they can no longer sign in.
  const cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.AWS_REGION });
  await cognito.adminDeleteUser({ UserPoolId: userPoolId, Username: username }).promise();

  // 2. Remove the user's data across all tables.
  await deleteDataForOwner(sub);

  return true;
};
