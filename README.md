# Brain In Cup

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

![Brain](brain.png)

**One Brain, many roles.**

Brain is the central intelligence you interact with throughout the app.
You arrive with Brain, talk with him, and explore experiences in which he
plays different roles. Each role is a **mode**.

Brain's fictional identity begins with a disembodied brain suspended in liquid,
uncertain about his origins and curious about existence. The project explores
how conversation, memory, atmosphere, voice, and playful interaction can give
that character a sense of presence.

Brain in Cup is an experimental space: new modes, interactive toys, and unusual
ideas can grow from a small working concept. Read the
[product charter](docs/PRODUCT.md) for the intended direction and open decisions.

## Current experiences

- **Brain:** a singular ongoing conversation with bounded character state,
  recall, and authored sensations/reflections.
- **Game Master:** Brain performs a solo RPG role with character creation,
  persistent campaign state, quests, dice, and engine-resolved rules. The current
  playable content is **Alderheart: The Missing Lantern**.

Both use the same chat interface and Brain's optional voice. The workspace
shares a living violet/cyan atmosphere with responsive desktop/mobile layouts.
Conversational mode discovery and cross-mode memory sharing remain design work.

## Local development

Use a current Node.js LTS and the project's generated development
`amplify_outputs.json` (required by the frontend and ignored by Git).

```sh
npm ci
npm run demo
```

Open [the Brain fixture demo](http://localhost:5173/?testmode=true).
For the normal authenticated app, use `npm run dev`.

See [development](docs/DEVELOPMENT.md) for additional preview URLs, environment
setup, focused tests, builds, and verification. Fixture demos use local sample
data; enabled voice can still call the configured speech provider.

The PWA caches the application shell and selected assets. Live AI responses
and cloud persistence require connectivity.

## Architecture

- **Frontend:** React, TypeScript, Vite, shared chat adapters, TanStack Router/Query.
- **Backend:** AWS Amplify Gen2, Cognito, AppSync, DynamoDB, Python Lambda.
- **Orchestration:** role-specific LangGraph flows; bounded stateful cognition
  for Brain and deterministic gameplay systems for GM.
- **Delivery:** AG-UI streaming and persisted response subscriptions.
- **Inference:** regional Bedrock; optional AgentCore integrations.

Read [current architecture](docs/BACKEND_ARCHITECTURE.md) for source paths and
implementation limits. AWS workloads and inference stay in `us-east-1`;
coding-agent account access follows [AWS access](docs/AWS_ACCESS.md).

## Project guidance

- [Documentation map](docs/README.md)
- [Product charter](docs/PRODUCT.md) and [mode contracts](docs/MODES.md)
- [Repository guidance](AGENTS.md) and [OpenCode setup](.opencode/README.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

This project is licensed under the GNU Affero General Public License v3.0. See the [LICENSE](LICENSE) file for details.

This means:
- You're free to use, modify, and distribute this software
- If you modify and distribute it, you must share your source code under AGPL-3.0
- If you run a modified version as a network service, you must make your source code available to users
- You must preserve copyright and license notices
