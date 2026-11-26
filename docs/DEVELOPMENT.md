# Local Development and Verification

Run repository-root commands from the repository root unless stated otherwise.
Use a current Node.js LTS compatible with `package-lock.json`.

## Setup and demo

```sh
npm ci
npm run demo
```

The frontend imports the ignored, generated `amplify_outputs.json`, including
in fixture mode. Use the project's existing development outputs. If they are
missing, obtain the appropriate generated artifact through the cloud workflow;
do not invent resource IDs or deploy merely to make a preview start.

The demo enables development-only fixture authentication. Default URLs:

| Preview | URL |
| --- | --- |
| Brain conversation | `http://localhost:5173/?testmode=true` |
| Empty Brain workspace | `http://localhost:5173/?testmode=true&empty=true` |
| GM conversation | `http://localhost:5173/quest/test-conversation-2?testmode=true` |
| GM interaction preview | `http://localhost:5173/?testmode=true&preview=gm` |
| Dice | `http://localhost:5173/?testmode=true&preview=dice` |
| Brain arrival | `http://localhost:5173/?testmode=true&preview=brain` |
| Shared conversation | `http://localhost:5173/?testmode=true&preview=conversation` |

Use the actual URL printed by Vite if the port is occupied. Keep the server
running and open the relevant page for the user during visual work.
`npm run dev` starts the normal authenticated app; `?testmode=true` alone does
not enable fixture auth.

Fixtures do not exercise live AI or deployed persistence. Voice is muted by
default; Listen/unmute can call ElevenLabs and consume credits when configured.
Use mocked voice for ordinary local checks. See [voice](chat-voice.md).

## Select checks by change

| Change | Relevant checks |
| --- | --- |
| Docs / agent guidance | JSON/frontmatter, links, referenced paths, OpenCode discovery, `git diff --check` |
| Frontend behavior | Focused Vitest tests, `npm run build`, lint affected files |
| Shared chat / navigation / lifecycle | Focused tests, then `npm test` and `npm run build` |
| Amplify schema / server TypeScript | `npx --no-install tsc --noEmit -p amplify/tsconfig.json`; affected tests/build |
| Python experience / persistence | Relevant mocked unittest modules; broader suite for shared contracts |
| Visual interaction | Relevant checks above plus actual desktop/mobile and interaction review |

### Frontend and server TypeScript

```sh
npm test -- src/components/ChatTranscript.test.tsx
npm test
npm run build
npx --no-install tsc --noEmit -p amplify/tsconfig.json
npm run lint
```

These are choices based on scope, not a mandatory sequence for every edit.
`npm run build` checks application and Vite/server-tool TypeScript, then builds
the frontend. It does not deploy. To narrow lint, pass actual changed files:

```sh
npx --no-install eslint src/components/ChatComposer.tsx --max-warnings 0
```

Report observed failures. Do not assume the repository-wide lint baseline is
clean or broken from a historical note, or fix unrelated violations to complete
an otherwise focused task.

### Python

Lambda's runtime is currently Python 3.12. For an explicitly requested local
environment setup, use a virtualenv with the Lambda dependencies and local SDK:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install boto3 -r amplify/functions/brain/layer/requirements.txt
```

The root `pyproject.toml` does not define Lambda's dependency set.
With the environment active, run from `amplify/functions/brain/src`:

```sh
env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE -u AWS_SESSION_TOKEN \
  AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null \
  AWS_EC2_METADATA_DISABLED=true \
  AWS_ACCESS_KEY_ID=testing AWS_SECRET_ACCESS_KEY=testing \
  AWS_DEFAULT_REGION=us-east-1 AWS_REGION=us-east-1 \
  AGENTCORE_RUNTIME_ARN= AGENTCORE_MEMORY_ID= AGENTCORE_MEMORY_EPISODIC_STRATEGY_ID= \
  LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false \
  python -m unittest discover -s tests -p 'test_*.py' -v
```

For a focused run, replace the pattern with e.g. `test_brain_graph.py`,
`test_brain_state_store.py`, `test_orchestrator.py`, or `test_narrator_notes.py`.
The tests inject/mock cloud and model services. Credential isolation prevents
ambient authentication; it is not a network sandbox. New tests must also mock
external calls. Missing tooling should be reported, not installed implicitly
by a verification-only task.

## Review behavior, not just compilation

Exercise the relevant parts of:

- Fresh sign-in to Brain, explicit mode navigation, resuming sessions, and
  unfinished character creation.
- Shared message/input interactions, selection, keyboard focus, scrolling,
  mobile layout, empty chats, and reduced motion.
- Stream completion/errors, duplicate delivery, cancellation, pending dice,
  and voice stopping on navigation/clear.
- Character/world consistency, memory provenance, reset fences, and deletion.

A screenshot path or a successful HTTP response is not proof of visual review.
Record what you actually inspected and any unavailable browser/device coverage.

## Handoff

Run `git diff --check` and review the changed/untracked files. Summarize the
result, exact checks and outcomes, and remaining limits. Include the live demo
link for visual changes. Use conventional commit/PR titles; publish only when
requested. Cloud deployment and live inference are separate work under
[AWS access](AWS_ACCESS.md).
