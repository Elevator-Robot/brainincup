import { createMemoryHistory } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from './router';

const testMode = vi.hoisted(() => vi.fn(() => false));
vi.mock('./utils/testMode', () => ({ isTestModeEnabled: testMode }));

beforeEach(() => { localStorage.clear(); testMode.mockReturnValue(false); });
afterEach(() => { localStorage.clear(); });

async function visit(path: string) {
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return router.state.location.pathname;
}

describe('Brain-first workspace entry', () => {
  it('opens account-resolved Brain, not a saved adventure or a stale cached ID', async () => {
    localStorage.setItem('lastPersonalityMode', 'game_master');
    localStorage.setItem('lastActiveConversationId', 'old-adventure');
    localStorage.setItem('lastConversationId:brain', 'another-account-brain');
    expect(await visit('/')).toBe('/brain/new');
  });

  it('preserves an adventure deep link for an already authenticated user', async () => {
    expect(await visit('/quest/saved-adventure')).toBe('/quest/saved-adventure');
  });

  it('preserves an explicit Brain conversation link', async () => {
    expect(await visit('/brain/my-brain')).toBe('/brain/my-brain');
  });

  it('uses Brain as the default demo entry too', async () => {
    testMode.mockReturnValue(true);
    expect(await visit('/?testmode=true')).toBe('/brain/demo-brain');
  });
});
