import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';

it('uses shipped portraits even when a separate image CDN is configured', async () => {
  vi.stubGlobal('__AMPLIFY_OUTPUTS__', { custom: { imageCDNUrl: 'https://empty-cdn.example.com' } });
  try {
    const { CHARACTER_AVATAR_OPTIONS } = await import('./gameMasterAvatars');
    expect(CHARACTER_AVATAR_OPTIONS.length).toBeGreaterThan(0);
    for (const avatar of CHARACTER_AVATAR_OPTIONS) {
      for (const src of [avatar.src, avatar.srcWebp, avatar.srcThumbnail, avatar.srcMedium]) {
        expect(src).toMatch(/^\/images\/avatars\//);
        expect(existsSync(resolve('public', src.slice(1))), `Missing shipped portrait: ${src}`).toBe(true);
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
