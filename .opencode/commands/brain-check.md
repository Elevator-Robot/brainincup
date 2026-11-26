---
description: Run the relevant local checks and report their actual results
agent: build
subagent: false
---

Verify this Brain in Cup scope: $ARGUMENTS

Load `brain-verify`. If no scope is given, use the current working changes.
Inspect the diff, select the relevant local checks from `docs/DEVELOPMENT.md`,
and execute them. Report exact commands, results, and anything unverified.
This is verification: do not silently fix failures, install missing tooling,
deploy, invoke paid services, or make account-connected AWS calls.
