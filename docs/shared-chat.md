# One chat presentation for every mode

`ChatTranscript` owns the message viewport, spacing, message list, and pending
response indicator. Both workspace layouts and the development previews use it.
`MessageBubble`, `MessageActions`, and `ChatComposer` have no mode IDs or separate
desktop/mobile presentation branches. Responsive CSS adapts the same markup.
`.cosmic-chat-surface` fixes common chat tokens so an experience's context-rail
theme cannot silently reskin the conversation.

## Adding a mode

Supply a `ChatComposerConfiguration` from an experience adapter:

- Actions and optional quick suggestions.
- Accessible input label.
- A completion function, which may return an empty string.

Keep input placeholders and conversation lifecycle in the controller. Empty
transcripts deliberately show no welcome heading or conversation-starter cards;
actual introductory narration belongs in a real message, not a separate surface.
Pass prepared messages and an optional `renderExtension` to `ChatTranscript`.
An extension returns `undefined` for ordinary messages, a React element for a
domain-specific control, or `null` to hide that control. Never copy the transcript
or branch shared message styling on a mode name. Tests cover an arbitrary future
configuration and guard the common renderer against mode-identity checks.

The input uses a stable full-column width, shared surface/radius tokens, and
quiet focus lighting. Only textarea height grows with the draft. There is no
star/Actions launcher below the input; slash suggestions and the context menu
remain available without adding persistent controls to the writing surface.
Native placeholders stay in the placeholder attribute, never the draft value.
Predictive ghost text is inert, aria-hidden, and non-selectable; accepting it
with Tab is the only way a suggestion becomes real editable/selectable text.

The GM adapter owns dice-result payload filtering, the roll-animation reveal
barrier, and dice prompts. Those controls do not replace ordinary message UI.
Character/quest/location context stays outside the conversation. The unreachable
legacy GM HUD formerly embedded in the desktop message area was removed; current
context panels and quest persistence/query caching remain in place.

## Narrator annotations

Every assistant message uses the same disclosure when annotations exist:
`sensations`, `thoughts`, `memories`, and `selfReflection`. Empty messages do not
promise hidden details. Click, disclosure button, keyboard, selection protection,
Copy, Listen, reveal transitions, and reduced motion work identically across modes.
Voice timing is passed as ephemeral `SpeechPlayback` to the same transcript and
message renderer. The active spoken sentence follows the audio media clock;
there is no experience-specific timing implementation. Full text remains readable
and manual listening preserves the global mute preference.

GM narration is original, measured second-person storytelling: sensory detail,
understated interpretation, and player agency rather than prescribed emotion.
The backend requests short **authored, player-facing narrator notes**, not private
model reasoning, plans, undiscovered clues, or hidden NPC information. Memories
must come from established story context; empty fields are preferable to invented
history. These annotations never adjudicate rules or mutate game state.

One streaming inference produces prose followed by a `<NARRATOR_NOTES>` JSON
trailer. The parser buffers only possible marker prefixes and the bounded trailer;
ordinary narration still streams immediately. It strips the trailer from public
text and speech, validates known metadata fields, and drops malformed, truncated,
or oversized notes. The graph finalizer places valid notes on the existing
`response_complete` metadata contract; non-streaming execution returns the same
fields. Existing BrainResponse persistence/hydration carries them across reloads.

Old GM messages with no stored annotations are not retroactively invented. New
annotations require releasing the backend code as well as the shared frontend.
The local GM demo includes authored fixtures to review without inference or AWS.

## Local review

- Brain: `http://localhost:5173/?testmode=true`
- GM: `http://localhost:5173/quest/test-conversation-2?testmode=true`

Run `npm run demo`, compare both at the same viewport, and open a message's
thoughts. New modes must conform to the shared components rather than add skins.
Python narrator parser/pipeline tests use mocked inference; UI and architecture
tests run with `npm test`.
