# Brain in Cup — Project Guidance

## Product compass

**One Brain, many roles.** The user always interacts with Brain. A **mode** is
a role Brain plays to give the user an experience. Brain is the entry point
and guide; Game Master is one mode in an experimental, expandable app.

Read [the product charter](docs/PRODUCT.md) before product, mode, or identity
changes. It records accepted intent and explicitly separates open questions
from implemented behavior. Historical proposals are not an approved backlog.

## Working agreements

- Inspect the current source and working tree before changing files. Preserve
  unrelated work. Prefer the smallest coherent, reversible implementation.
- Keep guidance concise: shared intent here and in the charter, implementation
  rules in scoped `AGENTS.md`, task workflows in `.opencode/skills/`.
- Use existing experience adapters and shared components before adding a new
  abstraction. Extend the architecture when a real experiment needs it.
- State assumptions that affect identity, persistence, or player behavior.
  Ask when a consequential product decision is unresolved; continue independent work.
- Distinguish implemented, locally verified, and deployed. Local fixtures are
  demonstrations, not evidence of live inference or production behavior.
- Run checks appropriate to the change; see [development](docs/DEVELOPMENT.md).
  Add tests for meaningful behavior and regressions, not implementation-shaped
  assertions for cosmetic edits. Report failures and verification limits.
- During visual UI work, keep a local demo running, open it for the user, and
  include the working demo URL in the handoff.
- Use conventional commits and PR titles: `type(scope): lowercase imperative`.
  Keep changes focused; commit or publish when requested.

## Product and interface invariants

- Successful sign-in opens the current user's singular Brain conversation.
  Later hydration or duplicate auth events must preserve explicit navigation
  and unfinished `/quest/new` character creation.
- Every mode uses `ChatTranscript`, `MessageBubble`, and `ChatComposer` with
  the same presentation and interactions. Mode-specific capabilities enter
  through adapters/extensions, not mode checks or alternate chat skins.
- Empty chats show atmosphere and the composer, without welcome headings,
  starter cards, or fabricated messages. Brain's guidance belongs in genuine
  interaction; new onboarding behavior requires an explicit product decision.
- Keep the window responsibilities stable:
  **top** = branding/persistent actions; **left** = global navigation;
  **center** = conversation/input; **right** = mode/session context.
- Brain's identity is shared. Memory sharing between modes is a separate,
  explicit design decision; do not silently merge personal and fictional state.

## Where to work

| Area | Guidance / entry point |
| --- | --- |
| Product and mode vocabulary | `docs/PRODUCT.md`, `docs/MODES.md` |
| Frontend, atmosphere, interaction | `src/AGENTS.md`, `src/App.tsx`, `src/chat/` |
| Backend, state, AI orchestration | `amplify/AGENTS.md`, `docs/BACKEND_ARCHITECTURE.md` |
| Optional container runtime | `agent-runtime/AGENTS.md` |
| Local checks and previews | `docs/DEVELOPMENT.md` |
| OpenCode agents, commands, skills | `.opencode/README.md`, `.opencode/AGENTS.md` |
| Current versus historical docs | `docs/README.md` |

## Cloud boundary

- Keep AWS workloads and inference in `us-east-1`; no cross-region inference
  profiles (`us.`, `global.`, etc.) or expanded regional SCP permissions.
- Delegate account-connected investigation to `aws-readonly`. AWS mutations
  require the user to explicitly name `@aws-mutating` for that operation.
  A request to implement or deploy a feature does not grant that authorization.
- Follow [AWS access](docs/AWS_ACCESS.md); never use ambient credentials or
  the retired `aws-reader` workflow. If the required agent is unavailable,
  report the blocker and continue local work.
- Other subagents are opt-in: use them when the user requests delegation or
  invokes a command explicitly configured to run one.
