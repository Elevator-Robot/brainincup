---
name: brain-verify
description: Use when verifying Brain in Cup changes, selecting local tests, or preparing an implementation handoff
---

# Verify the Change

Use [development](../../../docs/DEVELOPMENT.md) as the command reference.
Do not assume an old work log proves the current tree passes.

1. Inspect the scope and working tree. Identify changed behavior and the layers
   it touches: guidance, frontend, schema/server TypeScript, Python, or visuals.
2. Select the smallest meaningful checks. Run focused tests first; use build,
   lint, and broader suites when shared contracts or the change's scope need them.
3. Use mocked/injected Python services and the documented isolated AWS environment.
   Normal validation must not contact a real account or model endpoint.
4. For visual changes, run and open the local fixture demo. Check the affected
   interaction at desktop/mobile sizes and keyboard/reduced-motion behavior.
   A server response or a saved screenshot is not visual inspection.
5. Check related contracts: fresh Brain landing, explicit mode navigation,
   conversation identity, replay/cancellation, state/reset, and role boundaries
   only where the change can affect them.
6. Review the final diff for unintended files, generated artifacts, stale
   documentation, and secrets. Use `git diff --check`.

For docs/OpenCode-only changes, validate JSON/frontmatter, links, referenced
paths, command/agent/skill IDs, and discovery. Application builds are not
required merely because a Markdown file changed.

Report exact commands and outcomes. Distinguish a known baseline issue from
a regression only with evidence. Do not silently fix failures in a
verification-only task, install missing dependencies, or broaden testing after
the relevant checks pass without a new reason.

The handoff states the result, relevant checks, remaining limits, and the demo
link for visual work. Never imply a deployment or live-service test happened
because local checks passed.
