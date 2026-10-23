import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeBrainLogin, rememberBrainLogin } from './loginLanding';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('Brain sign-in landing intent', () => {
  it('does not redirect an ordinary authenticated refresh', () => {
    expect(consumeBrainLogin()).toBe(false);
  });

  it('survives an OAuth navigation and is consumed only once', () => {
    rememberBrainLogin();
    expect(consumeBrainLogin()).toBe(true);
    expect(consumeBrainLogin()).toBe(false);
  });

  it('remembers a cold OAuth callback even after the SDK cleans the URL', async () => {
    const previous = location.href;
    try {
      history.replaceState(null, '', '/?code=synthetic&state=synthetic');
      vi.resetModules();
      const freshPage = await import('./loginLanding');
      history.replaceState(null, '', '/quest/old-adventure');
      expect(freshPage.consumeBrainLogin()).toBe(true);
      expect(freshPage.consumeBrainLogin()).toBe(false);
    } finally { history.replaceState(null, '', previous); }
  });

  it('does not store a conversation or user identity', () => {
    rememberBrainLogin();
    expect(Number.isFinite(Number(sessionStorage.getItem('brain-in-cup:login-pending')))).toBe(true);
    expect(sessionStorage.length).toBe(1);
  });

  it('expires stale sign-in intent instead of hijacking a later deep link', () => {
    vi.useFakeTimers();
    rememberBrainLogin();
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(consumeBrainLogin()).toBe(false);
  });

  it.each(['not-a-date', String(Date.now() + 3_600_000)])('rejects an invalid timestamp %s', value => {
    sessionStorage.setItem('brain-in-cup:login-pending', value);
    expect(consumeBrainLogin()).toBe(false);
  });

  it('tolerates unavailable storage so the in-memory auth gate can still work', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(() => rememberBrainLogin()).not.toThrow();
    expect(consumeBrainLogin()).toBe(false);
  });
});
