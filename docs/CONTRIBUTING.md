# Contributing

Start with [the product charter](PRODUCT.md) and [repository guidance](../AGENTS.md).
Brain is the central intelligence; modes are roles he performs. Experiments and
small interactive toys are welcome alongside reliability and implementation work.

## Working on a change

1. Inspect the current branch, working tree, and relevant source. Use a focused
   branch and preserve unrelated work.
2. For a new concept, describe the experience and the smallest useful slice.
   Discuss unresolved identity, memory, or lifecycle decisions rather than
   silently turning a proposal into product policy.
3. Follow the scoped frontend/backend guidance. Reuse shared chat and experience
   contracts; keep mode state and user memory boundaries explicit.
4. Verify the behavior with the relevant checks in [development](DEVELOPMENT.md).
   Open a running local demo for visual changes and include its URL.
5. Update current docs for changed contracts and accepted decisions. Preserve
   historical context under `history/`, clearly marked.

Local implementation does not authorize deployment or live paid-service calls.
Coding-agent cloud work follows [AWS access](AWS_ACCESS.md).

## Commits and pull requests

Use `type(scope): description` for commits and PR titles. Types:
`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`, `revert`.
Use an area such as `chat`, `brain`, `gm`, `auth`, or `opencode` as the scope.
Keep descriptions lowercase, imperative, without a trailing period, under
72 characters.

Use the [PR template](../.github/pull_request_template.md):

- **Summary:** what changed and why; significant tradeoffs.
- **Changes:** grouped notable changes, including migrations/removals.
- **Validation:** exact commands and manual/visual checks actually completed.
- **Risks:** concrete affected behavior and rollback/mitigation.
- **Notes:** follow-ups and out-of-scope items.

Write `- none` when a section has no items. Call out breaking changes explicitly
under Risks. Keep unrelated formatting and refactoring out of a focused PR.

## Reporting bugs and ideas

Check existing issues first. For bugs, include reproduction steps, expected and
actual behavior, revision, browser/device, and whether the issue used fixtures
or connected services. Redact account data and secrets.
For ideas, explain what you want to experience with Brain and what a first
experiment could teach us.


## Code of Conduct
This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.


## Licensing

See the [LICENSE](../LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.
