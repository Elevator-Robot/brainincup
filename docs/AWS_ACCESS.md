# AWS Access for Coding Agents

These rules carry the project's existing cloud-access boundary into the
repository. More restrictive user/organization instructions still apply.

## Routing

- Delegate every AWS account, organization, deployment, resource, log, metric,
  or operational-state inspection to **`aws-readonly`**.
- The primary agent may inspect repository source and use general AWS
  documentation. It does not run account-connected AWS CLI/SDK commands.
- Mutations belong only to **`aws-mutating`**, and only after the user explicitly
  names **`@aws-mutating` for the specific operation**. General requests to
  deploy, fix, migrate, or clean up are not sufficient.
- The primary and read-only agents remain read-only during an authorized
  mutation. Do not call mutation agents proactively.
- These agents are supplied by the operator's OpenCode setup. If unavailable,
  report the missing capability and continue local work; do not substitute
  another agent or ambient credentials.

## Approved identity

The AWS agent discovers profiles using names and non-secret SSO metadata in
`~/.aws/config`. Never dump that file in full or read/export credentials.

Approved profiles are:

- Names beginning `opencode-`; or
- Profiles whose configured `sso_role_name` is exactly
  `OpenCode-AdministratorAccess`; or
- Granted profiles whose name contains `OpenCode-AdministratorAccess` and
  whose `granted_sso_role_name` is exactly `OpenCode-AdministratorAccess`.
  Validate their configured `granted_sso_account_id` before use.

Use the normal CLI/SDK credential chain with the approved profile. An existing
credential process may run through that chain; never run it directly or export
its output. Do not use the old `assume Brain`/credential-export workflow.
Administrator access does not authorize mutations or privilege escalation.

Only an explicit `@aws-mutating` invocation may approve an otherwise unapproved,
exactly named profile for that one operation. The mutation agent must verify
the configured role, account, and STS identity. That exception does not extend
to the primary/read-only agents or later work.

## Authentication recovery

`aws-readonly` owns recovery for missing/expired SSO:

1. Run `aws sso login --no-browser` for the approved profile/session.
2. Open its authorization URL using
   `chromium --profile-directory=Default <authorization-url>`.
3. Wait for approval, then retry the original read.

Use Chromium's Personal profile (`Default`), never incognito or a temporary
profile. Send the user to manual recovery only if browser login fails, is
cancelled, or times out. Let the read-only agent discover candidate accounts;
ask the user when ambiguity remains.

## Regional constraint

Keep workloads and model inference in **`us-east-1`**. Do not introduce
cross-region inference profiles (`us.`, `global.`, etc.) or expand regional
SCP permissions. Reading a deployment script is not authorization to run it.
