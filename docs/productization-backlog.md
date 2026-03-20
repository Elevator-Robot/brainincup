# Brain in Cup — Productization Execution Backlog

This backlog translates `docs/productization-analysis.md` into concrete implementation work.

## Priority model

- **P0**: Production blockers (security, data integrity, reliability).
- **P1**: UX coherence and activation.
- **P2**: Growth loops and premium depth.

---

## Phase 1 (Now) — Stabilize foundation

## P0-1 Harden auth/test bypass behavior
- **Goal:** Ensure production cannot bypass auth via URL flags.
- **Scope:**
  - Gate all `testmode` behavior behind explicit dev-only feature flag.
  - Remove implicit query-param-only bypass paths.
- **Acceptance criteria:**
  - In production builds, `?testmode=true` has no effect.
  - In development, `testmode` only works when explicit env flag is enabled.

## P0-2 Remove unsafe owner fallback in backend persistence
- **Goal:** Prevent cross-user data writes.
- **Scope:**
  - Remove hardcoded fallback owner ID in backend memory response save path.
  - Require owner for writes; fail explicitly when missing.
- **Acceptance criteria:**
  - No hardcoded owner UUID in response persistence path.
  - Missing owner triggers explicit error path and logging.

## P0-3 Improve character lookup query path
- **Goal:** Eliminate large fixed list scans and reduce latency.
- **Scope:**
  - Attempt indexed/filter lookup first.
  - Use bounded paginated fallback instead of `limit: 1000`.
- **Acceptance criteria:**
  - No single-request `limit: 1000` character load.
  - Character fetch still works for GM conversations.

## P1-1 Replace placeholder PersonalityIndicator
- **Goal:** Ship a real, mode-aware status indicator to unify UX language.
- **Scope:**
  - Implement visual indicator for Brain and Game Master states.
  - Reuse existing mode metadata and styling system.
- **Acceptance criteria:**
  - Indicator renders meaningful state in both modes.
  - No-op placeholder removed.

## P0-4 Observability baseline (next pass)
- **Goal:** Capture minimum production telemetry.
- **Scope:**
  - Add structured counters/timers around response pipeline success/failure.
  - Reduce verbose console logging in frontend production paths.
- **Acceptance criteria:**
  - Dashboard-ready metrics emitted for request count, error count, latency.
  - Debug-heavy logs gated by environment.

---

## Phase 2 (Next) — Unify experience

## P1-2 Seamless mode switching in-thread
- Preserve current conversation/session when switching mode.
- Add transition cue and maintain context continuity.

## P1-3 Shared response contract
- Standardize assistant output sections (Now / Next / Memory).
- Keep mode flavor via style + framing, not structural divergence.

## P1-4 Onboarding fork + fast first success
- First-run chooser: Reflect / Adventure.
- GM quick-start character by default.

---

## Phase 3 (Later) — Grow product system

## P2-1 Recaps and return loops
- Daily/weekly summary cards for thought and quest arcs.

## P2-2 Cross-mode bridge moments
- Convert reflections to quests and quest events to reflection prompts.

## P2-3 Premium continuity depth
- Package extended memory and advanced mode packs as premium value.

---

## Current sprint execution order

1. P0-1 Harden auth/test bypass behavior
2. P0-2 Remove unsafe owner fallback
3. P0-3 Improve character lookup query path
4. P1-1 Implement PersonalityIndicator
5. Validate (`npm run build`, `npm run lint`) and document follow-ups

---

## Implementation status (completed in this pass)

- ✅ P0-1 Hardened test-mode auth bypass by gating all `testmode` behavior behind a dev-only feature flag (`VITE_ENABLE_TESTMODE_AUTH=true`) via `src/utils/testMode.ts`.
- ✅ P0-2 Removed hardcoded owner fallback in backend save path and now require explicit owner/message IDs for BrainResponse persistence.
- ✅ P0-3 Replaced large fixed character fetch (`limit: 1000`) with indexed-first lookup plus bounded pagination fallback.
- ✅ P1-1 Replaced `PersonalityIndicator` no-op with a real mode-aware status component.
- ✅ Validation run: `npm run build` passed, Python compile passed, lint remains at existing baseline issues.
