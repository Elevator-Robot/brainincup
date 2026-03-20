# Brain in Cup — Minimal AGENT Guidance

Keep repository instructions minimal.

## Window Context-Scoped Design Philosophy

- **Top Window (header):** title, branding, and persistent buttons only. It should not change based on interaction context.
- **Menu Window (far-left):** global menu context only. It should remain stable across modes and states.
- **Interactions Window (center):** always the AI chat interaction area, including conversation stream and input.
- **Context Window (far-right):** context-sensitive surface that changes based on selected mode and current interaction state.

## Rule

When implementing UI changes, preserve these window responsibilities unless there is an explicit product decision to change them.
