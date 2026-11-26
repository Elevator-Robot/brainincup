# Maintaining OpenCode Guidance

- Target OpenCode V2. Consult the official `https://opencode.ai/docs/` pages
  for config, agents, commands, instructions, and skills before changing formats.
- Keep one project config in `.opencode/opencode.json`. Only the compact
  product charter is an extra always-loaded instruction; scoped rules and
  skills supply task-specific detail.
- Keep product truth in `docs/PRODUCT.md`, not copied into every agent prompt.
  Link repository docs with real relative Markdown links.
- Use V2 `permissions`, `shell`, and `subagent` fields/actions. Do not add
  legacy `tools`, `permission`, `bash`, `task`, `subtask`, or model-tuning fields.
- Project agents are opt-in development helpers, not in-app Brain modes.
  Keep the design/review agents read-only with explicit tool allowlists.
- Inherit the user's selected model. Provider credentials, default models,
  local-model services, MCP accounts, and terminal preferences belong to
  operator configuration, not this repository.
- Commands must explain their scope, accept `$ARGUMENTS` as prompt text, and
  load a skill only when the task matches. Avoid shell interpolation in templates.
- Give each skill a specific trigger and concise workflow. Skill IDs use
  lowercase kebab-case directories with `SKILL.md`; load supporting files on demand.
- Do not shadow the operator's `aws-readonly` or `aws-mutating` agents.
  Their absence is a blocker for cloud work, not permission to bypass delegation.
- Verify JSON/frontmatter, local links, command-to-agent/skill references,
  and OpenCode discovery after edits. Do not invoke paid models just to test discovery.
