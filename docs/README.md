# Documentation Map

## Start here

- [Product charter](PRODUCT.md): accepted direction — one Brain, many roles.
- [Modes](MODES.md): current inventory, terminology, and role contracts.
- [Architecture](BACKEND_ARCHITECTURE.md): current source-code paths and limits.
- [Development](DEVELOPMENT.md): local previews, meaningful checks, and handoff.
- [Contributing](CONTRIBUTING.md): workflow and pull requests.
- [OpenCode setup](../.opencode/README.md): agents, commands, and skills.
- [AWS access](AWS_ACCESS.md): cloud delegation, identity, and region rules.

## Focused implementation references

- [Shared chat and narrator annotations](shared-chat.md)
- [Brain state graph](../amplify/functions/brain/src/experiences/brain/README.md)
- [GM story stages, events, character memory, and dice](ORCHESTRATION.md)
- [GM location flow](LOCATION_FLOW.md)
- [GM interface](gm-ui.md)
- [Living background](living-background.md)
- [Chat voice](chat-voice.md)
- [Frontend game rules](../src/game/README.md)
- [Dice renderer](../src/components/dice/README.md)

## Operational references

[Deployment](DEPLOYMENT.md), [Bedrock access](chat-bedrock-access.md), and the
[scripts README](../scripts/README.md) contain environment-specific procedures
and historical observations. Inspect current source and use the AWS access
rules before acting on them; a command in a document grants no cloud authority.
Source descriptions do not establish what is deployed.

## Historical context

Older architecture, narrative extraction, restoration notes, and productization
proposals live in [history](history/README.md). They are retained for context,
not loaded as instructions or treated as an accepted roadmap.

When docs and code disagree, describe the discrepancy. The charter defines
desired behavior; source/tests establish implemented behavior. Update the
relevant document when the behavior or an accepted decision changes.
