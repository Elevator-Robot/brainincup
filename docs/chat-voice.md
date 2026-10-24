# ElevenLabs chat voice

Brain and Game Master use the account's custom **Aaron** voice. Each new page
starts muted. The persistent header control appears on desktop and mobile; its
hover/focus tooltip suggests trying Aaron. Unmute reads the latest completed
reply and enables narration of new replies. Each assistant reply also has a
Listen button, which enables voice and reads that reply. User messages, internal
thoughts, tool output, and unrevealed dice narration are not spoken.

Muted mode makes no synthesis requests. Muting, clearing chat, changing
conversations, or leaving the workspace stops playback and discards queued audio.
Already submitted provider requests may still consume credits; muting prevents
their late audio from playing and stops subsequent chunks. Failures mute voice
with a visible error without interfering with text chat. No browser speech-synthesis
fallback substitutes a different voice. Long replies are narrated in sequential
chunks, with markdown removed. Audio is kept only for current playback, not saved
in local storage, the service-worker cache, or conversation records.

## Server configuration (not applied by this branch)

- Set the Amplify backend secret **`ELEVENLABS_API_KEY`** through your approved
  deployment workflow. Never put it in a `VITE_*` variable, Amplify outputs,
  client code, Git, or a chat message. The key needs text-to-speech access and
  voice-list access if using name discovery. Set a provider-side credit limit.
- By default the backend searches the authenticated ElevenLabs account's personal/
  workspace voices for one exact, case-insensitive **Aaron** match. Missing,
  ambiguous, or incomplete results fail closed; it never chooses a public Aaron.
- For an unambiguous, stable selection, provide **`ELEVENLABS_VOICE_ID`** in the
  backend build environment (copy Aaron's voice ID from ElevenLabs). This avoids
  name discovery. A voice ID is not an API key; it stays server-configured here.
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
With configured credentials in an authorized deployed environment, verify:

1. Fresh Brain and GM sessions remain silent, including on mobile.
2. Unmute reads the latest reply using your actual Aaron; new replies play once.
3. Listen reads older replies, without replaying the rest of history.
4. Mute during preparation/playback, switch chats, and clear chat: no late playback.
5. Check mobile Safari/Chromium autoplay behavior and keyboard tooltip/focus access.
