# Dice components

- `../DiceRoller.tsx` is the game-facing component: lazy loading, visibility,
  reduced-motion fallback, and the requested roll's enabled state.
- `DiceScene.tsx` owns one canvas, geometry-only pointer hit testing, and
  keyboard-accessible targets. Blank space and captions never initiate rolls.
  Optional `rollStates`, keyed by die ID, give individual dice independent
  clocks and locks; omitted entries use the scene's shared request clock.
- `DiceArena.tsx` handles the orthographic camera, responsive layout, floor,
  and open-topped collision rails. The collection uses a tabletop camera.
- `DieBody.tsx` owns one rigid body. It starts face-down on the floor and
  receives one off-center impulse per roll. There is no mid-flight steering.
- `DieAppearance.tsx` handles materials, hover, press, and collision light.
  Feedback changes illumination, never the die's shape.
- `useDiePress.ts` cancels drags, scroll gestures, and outside releases.
- `DieFallback.tsx` provides painted-shape hit targets without WebGL.
- `DiceNumber3D.tsx` renders only the numeral, sized to the die's radius.
  `presentation.ts` defines its 300ms post-click delay and 180ms fade.
  Scrolling never separates the numeral from the die.

To add a die, extend `game/dice.ts`, implement its solid in
`utils/diceGeometry.ts`, add its fallback outline in `DieGlyph.tsx`, and
extend the geometry/range tests. `getDieRestPose` derives a grounded pose from
the geometry, so new solids do not need hand-tuned resting rotations.

`ChatDicePrompt` and `useChatDiceRolls` own game request IDs, expiry, results,
and retries. Rendering does not choose which game roll is allowed. The
development dice preview uses the same scene, with each asset click rolling
only that die. Its percentile tens and units are independently clickable.
