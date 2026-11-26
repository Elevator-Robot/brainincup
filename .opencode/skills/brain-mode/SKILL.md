---
name: brain-mode
description: Use when adding a Brain role or changing a mode's capabilities, entry/exit flow, state boundaries, or experience contract
---

# Build a Mode

Read [the product charter](../../../docs/PRODUCT.md) and
[mode contracts](../../../docs/MODES.md). Code paths below are repository-relative.
For design-only tasks, stop at the proposal; do not implement.

## Define the role

1. Explain the experience Brain gives the user and what distinguishes the role.
2. Define entry from Brain, any setup, a normal interaction, resuming a session,
   leaving the mode, and returning home.
3. Identify stable Brain identity, role instructions/capabilities, and per-session
   state. Specify what is remembered, where, and what clear/delete means.
4. Surface unresolved cross-mode memory and onboarding decisions. Do not assume
   universal recall or add fabricated introductory messages.

## Follow the existing contracts

- Frontend metadata: `src/constants/personalityModes.ts`. Preserve legacy aliases
  and stored IDs; inspect all normalization/routing sites when adding an ID.
- Entry/session lifecycle: `src/router.tsx`, `src/App.tsx`, and navigation
  components. A mode must not hijack fresh sign-in or later explicit navigation.
- Chat configuration: `src/chat/experienceAdapters.ts` and `presentation.ts`.
  Supply capabilities, prepared messages, and optional extensions.
  Keep shared chat independent of mode IDs and skins.
- Context: use the right-hand surface/mobile context patterns; keep persistent
  header and navigation responsibilities intact.
- Backend: `amplify/functions/brain/src/experiences/base.py` and `registry.py`.
  Implement normal and streaming paths using existing AG-UI and metadata
  contracts. Inspect `experiences/handler.py` for persisted mode dispatch.
- State: `amplify/data/resource.ts` and the relevant store. Reuse suitable
  contracts without putting unrelated role state into Brain's personal memory.

The current implementation has explicit Brain/GM branches. Adding a registry
entry alone is not a complete new mode. Trace the whole flow and generalize
only the seams the new role actually needs.

## Implement and verify

- Keep the first slice end-to-end and narrow. For rules-driven modes, resolve
  authoritative state before narration; preserve user agency.
- Add local fixtures where useful without enabling production auth bypasses.
- Verify routing/normalization, entry/return/resume, shared rendering, state
  isolation, error/cancellation paths, and relevant reset/deletion behavior.
- Use [development checks](../../../docs/DEVELOPMENT.md), then open the running
  demo for visual changes. Separate mocked preview evidence from live behavior.
- Update the mode inventory and any changed contracts. Record new product
  decisions only when the owner has made them.
