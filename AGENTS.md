# Brain in Cup — Minimal AGENT Guidance

Keep repository instructions minimal.

- During UI work, keep a local demo running and open it for the user; always
  provide a demo link with visual changes.
- Every mode uses `ChatTranscript`, `MessageBubble`, and `ChatComposer` with the
  same appearance and interactions. Supply mode content/capabilities through
  adapters; do not add mode checks or alternate skins to the shared chat UI.

- Keep AWS workloads and model inference in `us-east-1`. Do not use cross-region
  inference profiles (`us.`, `global.`, etc.) or expand regional SCP permissions.

- Shared cosmic styling and typography live in `src/cosmic-theme.css`; `retro-*` classes retain their layout roles. Brand utility colors live in `tailwind.config.js`.
- The workspace uses a violet/cyan nebula SVG with slow CSS drift and moving light in `SiteBackground`; respect reduced-motion preferences. The MP4 is exclusive to login. Match its soft luminous atmosphere, without orbital rings, diagram grids, or painted bands.
- Authentication is required: the login modal has no dismiss button or Escape-to-close behavior.
- Successful sign-in always opens the current user's Brain chat, never their last adventure.
  Startup hydration and duplicate auth events must not override explicit GM
  navigation or the `/quest/new` character-creation draft.
- Desktop and mobile account actions share `AccountMenu`; account deletion lives under Account settings and requires typing `DELETE` in the final dialog.
- Game Master context rails and mobile game-info panels stay closed until the
  current conversation's character is saved and creation is complete. Character
  creation belongs in its own dialog, never inside the right sidebar.

## Window Context-Scoped Design Philosophy

- **Top Window (header):** title, branding, and persistent buttons only. It should not change based on interaction context.
- **Menu Window (far-left):** global menu context only. It should remain stable across modes and states.
- **Interactions Window (center):** always the AI chat interaction area, including conversation stream and input.
- **Context Window (far-right):** context-sensitive surface that changes based on selected mode and current interaction state.

## Rule

When implementing UI changes, preserve these window responsibilities unless there is an explicit product decision to change them.
