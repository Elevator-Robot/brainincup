import { dataClient } from './dataClient';

const STATE_FIELDS = ['id', 'brainState', 'brainStateVersion'] as const;
const ID_FIELDS = ['id'] as const;
type ClearStage = 'reset-memory' | 'list-responses' | 'delete-responses' | 'list-messages' | 'delete-messages';
type FailureReason = 'api-error' | 'unverified-reset' | 'missing-page' | 'repeated-page';
type CleanupPage = { data: Array<{ id?: string | null } | null> | null; nextToken?: string | null; errors?: readonly unknown[] };

export class ClearBrainChatError extends Error {
  constructor(public readonly stage: ClearStage, public readonly reason: FailureReason) {
    const message = stage === 'reset-memory'
      ? 'Unable to verify that Brain’s memory was reset. Your chat has not been deleted. Please try again.'
      : 'Brain’s memory was reset, but some chat history could not be deleted. Please try clearing again.';
    super(message);
    this.name = 'ClearBrainChatError';
  }
}

function verifiedReset(data: unknown, id: string, revision: string): boolean {
  if (!data || typeof data !== 'object') return false;
  const row = data as { id?: unknown; brainState?: unknown; brainStateVersion?: unknown };
  // AWSJSON can be returned as serialized JSON. Only explicit JSON null counts
  // as empty; an omitted field, {}, malformed JSON, or a stale revision cannot.
  const empty = row.brainState === null || (typeof row.brainState === 'string' && row.brainState.trim() === 'null');
  return row.id === id && row.brainStateVersion === revision && empty;
}

/** Reset durable state before deleting history. Never fetch message contents or
 * unrelated legacy metadata just to remove a row; full default selections can
 * fail on old records whose generated required metadata is missing. */
export async function clearBrainChat(conversationId: string): Promise<void> {
  let stage: ClearStage = 'reset-memory';
  try {
    const revision = crypto.randomUUID();
    const options = { selectionSet: STATE_FIELDS, authMode: 'userPool' as const };
    const reset = await dataClient.models.Conversation.update({
      id: conversationId, brainState: null, brainStateVersion: revision,
    }, options);
    if (reset.errors?.length) throw new ClearBrainChatError(stage, 'api-error');
    if (!verifiedReset(reset.data, conversationId, revision)) {
      // A partial mutation echo is not proof of failure or success. Check the
      // exact fields explicitly, without accepting absent state as cleared.
      const readBack = await dataClient.models.Conversation.get({ id: conversationId }, options);
      if (readBack.errors?.length) throw new ClearBrainChatError(stage, 'api-error');
      if (!verifiedReset(readBack.data, conversationId, revision)) throw new ClearBrainChatError(stage, 'unverified-reset');
    }

    // Both models share the id-only cleanup contract. Keep response deletion
    // first so no response is left referencing an already-deleted message.
    for (const kind of ['responses', 'messages'] as const) {
      // Do not union the generated model clients: their deeply recursive
      // selection-set generics differ. Project each onto this tiny contract.
      const listPage: (cursor: string | null | undefined) => Promise<CleanupPage> = kind === 'responses'
        ? cursor => dataClient.models.BrainResponse.list({ filter: { conversationId: { eq: conversationId } }, nextToken: cursor, selectionSet: ID_FIELDS, authMode: 'userPool' })
        : cursor => dataClient.models.Message.list({ filter: { conversationId: { eq: conversationId } }, nextToken: cursor, selectionSet: ID_FIELDS, authMode: 'userPool' });
      const deleteRow: (id: string) => Promise<{ errors?: readonly unknown[] }> = kind === 'responses'
        ? id => dataClient.models.BrainResponse.delete({ id }, { selectionSet: ID_FIELDS, authMode: 'userPool' })
        : id => dataClient.models.Message.delete({ id }, { selectionSet: ID_FIELDS, authMode: 'userPool' });
      let cursor: string | null | undefined;
      const visited = new Set<string>();
      do {
        stage = kind === 'responses' ? 'list-responses' : 'list-messages';
        const page = await listPage(cursor);
        if (page.errors?.length) throw new ClearBrainChatError(stage, 'api-error');
        if (!Array.isArray(page.data)) throw new ClearBrainChatError(stage, 'missing-page');
        stage = kind === 'responses' ? 'delete-responses' : 'delete-messages';
        for (const row of page.data) {
          if (!row?.id) throw new ClearBrainChatError(stage, 'missing-page');
          const deleted = await deleteRow(row.id);
          if (deleted.errors?.length) throw new ClearBrainChatError(stage, 'api-error');
        }
        cursor = page.nextToken;
        if (cursor && visited.has(cursor)) throw new ClearBrainChatError(stage, 'repeated-page');
        if (cursor) visited.add(cursor);
      } while (cursor);
    }
  } catch (error) {
    if (error instanceof ClearBrainChatError) throw error;
    // Do not leak GraphQL result objects, chat contents, or transport errors into
    // diagnostics. The stage is enough to distinguish reset from cleanup failure.
    throw new ClearBrainChatError(stage, 'api-error');
  }
}
