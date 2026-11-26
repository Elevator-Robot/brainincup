# Frontend and Interaction Guidance

Apply the product charter and root guidance to both desktop and mobile.

## Shared interaction

- `src/chat/presentation.ts` defines presentation contracts;
  `experienceAdapters.ts` supplies mode capabilities.
- Reuse `ChatTranscript`, `MessageBubble`, `MessageActions`, and `ChatComposer`.
  Keep them independent of mode IDs. Use prepared messages, configuration, and
  `renderExtension` for domain controls such as dice.
- Brain remains the assistant identity and voice in every mode. A role's title
  describes the experience, not a replacement intelligence.
- Keep empty transcripts genuinely empty. Only actual assistant messages
  receive narration, annotations, or arrival effects.
- Preserve selection, keyboard input, focus, scroll position, and Markdown
  behavior when changing message rendering. Suggestions become input only
  through explicit acceptance.

## Layout and atmosphere

- Preserve top/left/center/right responsibilities from the root `AGENTS.md`.
  Put mode/session details in the context surface, not the persistent header.
- Adapt layout to available space while keeping actions and capabilities
  reachable on touch and desktop. Prefer shared responsive components so
  separate viewport implementations cannot drift.
- Keep persistent navigation anchors stable during transitions. The mobile
  hamburger remains visible in the same position when its menu opens or closes.
- Shared cosmic styling and typography: `src/cosmic-theme.css`.
  Brand utility colors: `tailwind.config.js`. `retro-*` classes retain layout roles.
- `SiteBackground` shares violet/cyan nebula atmosphere across modes;
  `NebulaBackdrop` enhances it with WebGL over an SVG/CSS fallback.
  The MP4 is exclusive to login. Avoid orbital rings, diagram grids, or painted bands.
- Respect reduced motion, hidden tabs, and renderer cleanup. Read
  `docs/living-background.md` before changing ambient graphics.
- Character creation stays in its own dialog. GM context rails and mobile
  game-info panels stay closed until this conversation's character is saved
  and creation is complete.

## Lifecycle and account behavior

- Authentication is required. The login modal has no dismiss control or
  Escape-to-close behavior. Keep demo auth gated by both development mode and
  `VITE_ENABLE_TESTMODE_AUTH=true` through `src/utils/testMode.ts`.
- Fresh sign-in goes to the account's Brain chat; later auth events/hydration
  must not override navigation or a `/quest/new` draft. Cover these races.
- Desktop/mobile account actions share `OptionsMenuContent` in
  `src/components/OptionsMenu.tsx`. Account deletion lives under Account
  settings and requires typing `DELETE` in the final dialog.
- Clearing Brain resets persistent cognitive state as well as history. Preserve
  the reset revision fence and cancel active streaming/voice before cleanup.
- Voice is shared and muted by default. Listen-once preserves that preference;
  annotations and unrevealed dice narration are not spoken. Follow
  `docs/chat-voice.md` for actual audio-clock synchronization.

## Verification

Use `docs/DEVELOPMENT.md` for checks and local fixture URLs. Keep the demo
running and open it for visual changes. Review each affected flow on a narrow
phone, tablet, and large desktop, including both sides of changed breakpoints.
Check overflow, control placement, and state/focus continuity during resizing;
cover touch, keyboard/software-keyboard, and reduced motion where affected.
Report the viewports actually reviewed and any unavailable device/browser coverage.
Keep new UI behavior in focused components/hooks/adapters rather than adding
unrelated orchestration to `src/App.tsx`.
