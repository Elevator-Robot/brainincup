# ElevenLabs chat voice

Brain and Game Master speak in **Brain’s voice**. Each new page
starts muted. On desktop, a waveform control in the left command rail toggles
voice across both modes, with a speaking waveform, state light, and Brain voice flyout.
Brain himself gives a playful cursor-local squish and springy rebound when poked;
that gesture does not change audio. Reduced-motion users get static feedback.
On mobile the voice control sits above the composer. Its hover/focus tooltip
suggests hearing Brain. Unmute reads the latest completed
reply and enables narration of new replies. Each assistant reply also has a
Listen button, which reads only that reply without changing automatic voice's
mute preference. While listening once, the global voice control stops playback;
after completion it returns to its existing muted/unmuted state. User messages, internal
thoughts, tool output, and unrevealed dice narration are not spoken.

Muted mode makes no automatic synthesis requests; explicit Listen reads only the
chosen reply. Muting, clearing chat, changing
conversations, or leaving the workspace stops playback and discards queued audio.
Already submitted provider requests may still consume credits; muting prevents
their late audio from playing and stops subsequent chunks. Failures mute voice
with a visible error without interfering with text chat. No browser speech-synthesis
fallback substitutes a different voice. Long replies are narrated in sequential
chunks, with markdown removed. Audio is kept only for current playback, not saved
in local storage, the service-worker cache, or conversation records.

## Text/audio synchronization

The server uses ElevenLabs' `/with-timestamps` endpoint, returning the audio and
validated original-text character alignment. `shared/chatSpeech.ts` defines the
same contract for the authenticated mutation, local proxy, and browser. Alignment
must match the exact synthesized chunk with finite, ordered timestamps; missing
or mismatched/normalized-only timing falls back to audio-only playback, never
estimated typewriter synchronization.

The shared message renderer keeps the full reply readable during voice playback
and highlights the sentence containing the current spoken character. It reads
`HTMLAudioElement.currentTime`, not wall-clock animation time. Chunk offsets,
pauses, buffering, seeks, playback-rate changes, visibility changes, cancellation,
and end-of-audio are handled explicitly. Muted replies retain normal text reveal;
Listen-once synchronization never changes the automatic mute preference.

Native CSS Highlights paint a DOM Range across Markdown nodes without rewriting
text, changing the user's Selection, moving focus, or forcing scrolling. Older
browsers use a coarser paragraph cue. Content without an exact prose match (for
example an omitted code block or image description) is not falsely highlighted.
Annotations, tool metadata, buttons, and private narrator trailers are excluded.
All timing state is ephemeral and is cleared on stop/navigation/chat clear.

Release the added optional `ChatSpeech.alignment` schema, function, regenerated
outputs, and frontend together. Existing audio-only responses can still play,
but cannot provide accurate synchronization. No new key permissions or model
inference calls are required. Timing is included in the existing TTS request.

## Server configuration (not applied by this branch)

### Local testing without AWS

Add `ELEVENLABS_API_KEY=...` and `ELEVENLABS_VOICE_ID=...` to the project's
Git-ignored `.env` file. The ID selects Brain's provider voice independently of
its saved label in ElevenLabs. Restart `npm run demo`,
then visit `http://localhost:5173/?testmode=true` and click **Unmute** or **Listen**.
This generates real speech and consumes ElevenLabs credits, but does not deploy
or invoke AWS. Keep the key unprefixed: **never** use `VITE_ELEVENLABS_API_KEY`.

Vite's server-only middleware reads the key; it is never sent to the browser.
The local paid route accepts only loopback connections, local Host headers,
same-origin requests, JSON POSTs, and the custom request marker. It rejects LAN,
tunnel, foreign-origin, and preflight requests. It allows one generation at a
time, up to 30 requests per minute, bounds input, cancels disconnected requests,
and disables audio caching. It does not exist in production builds or previews.
Synthesis shares the same transport as the deployed handler.

### Deployed backend

- Set the Amplify backend secret **`ELEVENLABS_API_KEY`** through your approved
  deployment workflow. Never put it in a `VITE_*` variable, Amplify outputs,
  client code, Git, or a chat message. The key needs text-to-speech access;
  voice-list access is not required. Set a provider-side credit limit.
- Set **`ELEVENLABS_VOICE_ID`** in the backend build environment (copy the desired
  voice ID from ElevenLabs). This is required: a missing ID fails closed, with no
  name-based lookup or substitute voice. A voice ID is not an API key; it stays
  server-configured here. The app always calls the voice Brain, never the
  creator's name or the provider's saved label.
- Deploy the new `chatVoice` function and `generateChatSpeech` AppSync mutation,
  regenerate Amplify outputs, and release the frontend together in **us-east-1**.
  No ElevenLabs account changes, synthesis, or AWS deployment are performed by
  implementing or running the mocked tests.

The authenticated AppSync mutation uses the caller's verified Cognito identity.
It does not reuse the public chat Function URL or accept a supplied owner. Only
signed-in users can invoke it. Text is capped at 1,000 characters per call; the
client uses 900-character chunks. It uses `eleven_flash_v2_5` and low-bandwidth MP3
to keep response size below the AppSync delivery limit. Provider requests time
out after 25 seconds and errors never include provider bodies or credentials.

This is an authenticated synthesis service, not a per-user billing/quota system.
Signed-in users can make repeated requests. Before a broad/public rollout, set
provider credit limits and assess application-level per-user rate limits based
on your account budget. Enabling voice sends the public assistant reply text to
ElevenLabs; their data-processing/retention terms apply. Browser autoplay policies
can require tapping Listen again; blocked playback surfaces an actionable error.

## Validation

`npm test`, `npm run build`, and `npx tsc --noEmit -p amplify/tsconfig.json`
exercise mocked synthesis and type-check the integration without paid API calls.
The build checks the application and Vite/server tooling independently, with
both consuming the shared speech contract directly from source.
With configured credentials in an authorized deployed environment, verify:

1. Fresh Brain and GM sessions remain silent, including on mobile.
2. Unmute reads the latest reply in Brain’s configured voice; new replies play once.
3. Listen reads older replies, without replaying the rest of history.
4. Mute during preparation/playback, switch chats, and clear chat: no late playback.
5. Check mobile Safari/Chromium autoplay behavior and keyboard tooltip/focus access.
