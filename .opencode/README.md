# OpenCode for Brain in Cup

The setup keeps **one Brain, many roles** present in every session while loading
detailed workflows only when needed. It targets OpenCode V2.

## Structure

```text
AGENTS.md                         repository-wide working agreements
docs/PRODUCT.md                   canonical product intent
src/AGENTS.md                     frontend and interaction rules
amplify/AGENTS.md                 backend/state/infrastructure rules
agent-runtime/AGENTS.md           optional transport rules
.opencode/
  opencode.json                  adds the product charter to instructions
  AGENTS.md                      maintenance rules for this setup
  agents/
    brain-designer.md             read-only experience/experiment design
    brain-reviewer.md             read-only implementation review
  commands/
    brain-design.md               propose an experience
    brain-experiment.md           implement a small working experiment
    brain-review.md               review a change
    brain-check.md                run relevant local checks
  skills/
    brain-mode/SKILL.md           implement or extend a role
    brain-experiment/SKILL.md     prototype a concept or interactive toy
    brain-verify/SKILL.md         select and run local verification
```

## Everyday use

| Command | Behavior |
| --- | --- |
| `/brain-design <idea>` | Starts `brain-designer` in a child session; returns a grounded proposal, without edits |
| `/brain-experiment <idea>` | Uses Build in the current session to implement and demonstrate a small experiment |
| `/brain-review [scope]` | Starts `brain-reviewer` in a child session; defaults to the working diff, including untracked files |
| `/brain-check [scope]` | Uses Build in the current session to run relevant local checks and report results |

Examples:

```text
/brain-design a mode where Brain helps me invent a world
/brain-experiment a small interaction that lets Brain react to a greeting
/brain-review
/brain-check the shared composer changes
```

You can also explicitly request `@brain-designer` or `@brain-reviewer`.
Ordinary development uses the existing primary agent. Subagents are opt-in;
the two background commands explicitly request them. Design/review permissions
allow local reading and, for review, a fixed set of Git inspection commands.
They cannot edit files, run tests, access cloud tools, or launch other agents.
Use `/brain-check` for execution-based verification.

Skills are discovered automatically. Load only those matching the task; a
routine bug fix does not require an experiment brief or a mode-design exercise.
For a simple experiment, the brief can stay in the conversation.

## Configuration boundaries

- Project settings do not select a provider/model or replace the user's global
  OpenCode preferences. Subagents inherit the session model.
- `AGENTS.md` is discovered automatically. The project config adds only
  `docs/PRODUCT.md`; do not glob-load the documentation directory.
- The legacy project `aws-reader` was removed. Cloud investigation uses the
  operator-provided `aws-readonly`; mutations require the user's explicit
  `@aws-mutating` invocation. See [AWS access](../docs/AWS_ACCESS.md).
- Config, agents, commands, and skills reload on save; `/reload` can force
  rediscovery. Already-loaded nested `AGENTS.md` changes may require a new
  session to take effect. Do not restart the background service for ordinary edits.

Start with [the docs index](../docs/README.md) for current implementation
references and [development](../docs/DEVELOPMENT.md) for demos/checks.
