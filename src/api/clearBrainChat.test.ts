import { beforeEach, expect, it, vi } from 'vitest';
import { clearBrainChat, ClearBrainChatError } from './clearBrainChat';

const api = vi.hoisted(() => ({ reset: vi.fn(), get: vi.fn(), responses: vi.fn(), messages: vi.fn(), deleteResponse: vi.fn(), deleteMessage: vi.fn(), revision: '' }));
vi.mock('./dataClient', () => ({ dataClient: { models: {
  Conversation: { update: api.reset, get: api.get },
  BrainResponse: { list: api.responses, delete: api.deleteResponse },
  Message: { list: api.messages, delete: api.deleteMessage },
} } }));
const stateOptions = { selectionSet: ['id', 'brainState', 'brainStateVersion'], authMode: 'userPool' };
const idOptions = { selectionSet: ['id'], authMode: 'userPool' };
const cleared = () => ({ id: 'brain', brainState: null, brainStateVersion: api.revision });

beforeEach(() => {
  vi.resetAllMocks();
  api.reset.mockImplementation(async payload => { api.revision = payload.brainStateVersion; return { data: payload }; });
  api.get.mockImplementation(async () => ({ data: cleared() }));
  api.responses.mockResolvedValue({ data: [{ id: 'r1' }] });
  api.messages.mockResolvedValue({ data: [{ id: 'm1' }] });
  api.deleteResponse.mockResolvedValue({ data: { id: 'r1' } });
  api.deleteMessage.mockResolvedValue({ data: { id: 'm1' } });
});

it('requests only reset proof and row IDs, avoiding unrelated required legacy metadata', async () => {
  // Reproduce a backend rejecting a full default selection on legacy rows.
  for (const list of [api.responses, api.messages]) list.mockImplementation(async options => (
    JSON.stringify(options.selectionSet) === '["id"]'
      ? { data: [{ id: 'legacy-row' }] }
      : { data: null, errors: [{ message: 'Cannot return null for non-nullable createdAt' }] }
  ));
  await clearBrainChat('brain');
  expect(api.reset).toHaveBeenCalledWith({ id: 'brain', brainState: null, brainStateVersion: expect.any(String) }, stateOptions);
  expect(api.responses).toHaveBeenCalledWith(expect.objectContaining({ ...idOptions, filter: { conversationId: { eq: 'brain' } } }));
  expect(api.deleteResponse).toHaveBeenCalledWith({ id: 'legacy-row' }, idOptions);
  expect(api.deleteMessage).toHaveBeenCalledWith({ id: 'legacy-row' }, idOptions);
  expect(api.get).not.toHaveBeenCalled();
  expect(api.reset.mock.invocationCallOrder[0]).toBeLessThan(api.deleteResponse.mock.invocationCallOrder[0]);
  expect(api.deleteResponse.mock.invocationCallOrder[0]).toBeLessThan(api.messages.mock.invocationCallOrder[0]);
});

it('accepts explicit serialized AWSJSON null without confusing it with missing state', async () => {
  api.reset.mockImplementation(async payload => ({ data: { ...payload, brainState: 'null' } }));
  await clearBrainChat('brain');
  expect(api.deleteMessage).toHaveBeenCalledOnce();
  expect(api.get).not.toHaveBeenCalled();
});

it('verifies a partial mutation echo through explicit read-back before deleting', async () => {
  api.reset.mockImplementation(async payload => { api.revision = payload.brainStateVersion; return { data: { id: payload.id } }; });
  await clearBrainChat('brain');
  expect(api.get).toHaveBeenCalledWith({ id: 'brain' }, stateOptions);
  expect(api.get.mock.invocationCallOrder[0]).toBeLessThan(api.deleteResponse.mock.invocationCallOrder[0]);
});

it.each([
  ['nonempty state', () => ({ ...cleared(), brainState: { schema_version: 1 } })],
  ['serialized nonempty state', () => ({ ...cleared(), brainState: '{}' })],
  ['missing state', () => ({ id: 'brain', brainStateVersion: api.revision })],
  ['stale revision', () => ({ ...cleared(), brainStateVersion: 'older' })],
  ['wrong conversation', () => ({ ...cleared(), id: 'other' })],
  ['missing record', () => null],
])('does not delete history after an unverified reset: %s', async (_label, result) => {
  api.reset.mockImplementation(async payload => { api.revision = payload.brainStateVersion; return { data: result() }; });
  api.get.mockImplementation(async () => ({ data: result() }));
  await expect(clearBrainChat('brain')).rejects.toMatchObject({ stage: 'reset-memory', reason: 'unverified-reset' });
  expect(api.responses).not.toHaveBeenCalled();
  expect(api.deleteMessage).not.toHaveBeenCalled();
});

it('does not treat a GraphQL authorization error as a successful reset', async () => {
  api.reset.mockResolvedValue({ data: null, errors: [{ message: 'Unauthorized' }] });
  await expect(clearBrainChat('brain')).rejects.toMatchObject({ stage: 'reset-memory', reason: 'api-error' });
  expect(api.get).not.toHaveBeenCalled();
  expect(api.responses).not.toHaveBeenCalled();
});

it('follows empty filtered pages and deletes every page before moving to messages', async () => {
  api.responses.mockResolvedValueOnce({ data: [], nextToken: 'second' }).mockResolvedValueOnce({ data: [{ id: 'r2' }], nextToken: null });
  api.messages.mockResolvedValueOnce({ data: [{ id: 'm1' }], nextToken: 'more' }).mockResolvedValueOnce({ data: [{ id: 'm2' }], nextToken: null });
  await clearBrainChat('brain');
  expect(api.responses).toHaveBeenCalledTimes(2);
  expect(api.responses).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: 'second' }));
  expect(api.deleteResponse).toHaveBeenCalledWith({ id: 'r2' }, idOptions);
  expect(api.deleteMessage).toHaveBeenCalledTimes(2);
});

it.each([
  ['list-responses', 'responses'], ['delete-responses', 'deleteResponse'],
  ['list-messages', 'messages'], ['delete-messages', 'deleteMessage'],
] as const)('identifies the failing cleanup stage: %s', async (stage, method) => {
  api[method].mockResolvedValue({ data: null, errors: [{ message: 'private response details' }] });
  try { await clearBrainChat('brain'); throw new Error('Expected failure'); }
  catch (error) {
    expect(error).toBeInstanceOf(ClearBrainChatError);
    expect(error).toMatchObject({ stage, reason: 'api-error' });
    expect((error as Error).message).toContain('Brain’s memory was reset');
    expect(JSON.stringify(error)).not.toContain('private response details');
  }
});

it('rejects incomplete list results rather than claiming cleanup succeeded', async () => {
  api.responses.mockResolvedValue({ data: null });
  await expect(clearBrainChat('brain')).rejects.toMatchObject({ stage: 'list-responses', reason: 'missing-page' });
  expect(api.messages).not.toHaveBeenCalled();
});

it('terminates a repeated pagination token instead of looping forever', async () => {
  api.responses.mockResolvedValue({ data: [], nextToken: 'same' });
  await expect(clearBrainChat('brain')).rejects.toMatchObject({ reason: 'repeated-page' });
  expect(api.responses).toHaveBeenCalledTimes(2);
});

it('allows idempotent deletion of a row already removed by an earlier attempt', async () => {
  api.deleteResponse.mockResolvedValue({ data: null });
  api.deleteMessage.mockResolvedValue({ data: null });
  await expect(clearBrainChat('brain')).resolves.toBeUndefined();
});
