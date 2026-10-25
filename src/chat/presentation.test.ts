// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it.each(['ChatTranscript', 'MessageList', 'MessageBubble', 'ChatComposer'])('%s stays independent of mode and viewport identities', component => {
  const source = readFileSync(new URL(`../components/${component}.tsx`, import.meta.url), 'utf8');
  expect(source).not.toMatch(/\bisGameMasterMode\b|\bgame_master\b|GAME_MASTER_CHAT|variant\s*:\s*'desktop'/);
});

it('disables selection only on native buttons, not the message disclosure role', () => {
  const css = readFileSync(new URL('../cosmic-theme.css', import.meta.url), 'utf8');
  const rule = css.match(/^button, button \* \{([^}]+)\}/m);
  expect(rule?.[1]).toContain('-webkit-user-select: none');
  expect(rule?.[1]).toContain('user-select: none');
  expect(rule?.[0]).not.toContain('[role=');
});
