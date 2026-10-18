# Chat outage: Bedrock cross-region access

## Confirmed cause — October 18, 2026

Both Brain chat and Game Master narration use Bedrock streaming inference.
Production CloudWatch logs report `AccessDeniedException` for
`bedrock:InvokeModelWithResponseStream` against:

```text
arn:aws:bedrock:us-east-2::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0
```

The denial explicitly identifies organization SCP `p-i5ybg03f`. The configured
model is `us.anthropic.claude-haiku-4-5-20251001-v1:0`; its active inference profile
routes to **us-east-1, us-east-2, and us-west-2**, even though the Lambda runs in
us-east-1. Brain logged the denial at 16:55:39 UTC; GM logged the same denial at
17:00:40 and 17:00:48 UTC.

## Required region policy

This application must run inference strictly in **us-east-1**. Keep the
organization's region restrictions intact. Selecting the us-east-1 API endpoint
does not constrain a `us.` or `global.` inference profile to that region.

## Application repair

Keep Claude Haiku 4.5, but invoke its regional Mantle Messages API:

```text
Model: anthropic.claude-haiku-4-5
Endpoint: https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages
```

The [AWS model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html)
documents in-region availability at this endpoint. The old bedrock-runtime API
only supports inference profiles for this model; removing `us.` from the old
model ID would not fix it.

The shared transport signs requests using the Lambda role's rotating credentials
and the `bedrock-mantle` signing service. It pins the endpoint to us-east-1,
rejects other regions and inference profiles, and disables HTTP redirects.
The old Haiku US profile setting is migrated to the regional model ID. Brain,
GM narration, and non-streaming title generation all use this transport.

Streaming error events and connections closed before `message_stop` are treated
as failures, not successful empty replies. No live inference calls were made
during the read-only investigation or offline tests.

Read-only verification confirmed Mantle's us-east-1 model catalog reports
`anthropic.claude-haiku-4-5` as `available`, and the account has an active default
project. IAM simulation allowed `bedrock-mantle:CreateInference` on that project
with the us-east-1 and model conditions, including the Organizations decision.
The deployment declares that project-scoped permission with both conditions;
it no longer declares cross-region Bedrock inference permissions.

After deploying the regional configuration, verify a new message in each chat
mode and check that the associated Lambda logs no longer contain the access
denial. No AWS policy changes were applied during this investigation.

Reference: [Bedrock geographic cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).

## Application fixes

- Brain and GM now share the same technical-difficulties message. GM emits the
  same failure text in its live stream and persisted response.
- Character portraits use `/images/avatars/` assets shipped with the frontend.
  The configured separate CDN returned 404 for the tested original, thumbnail,
  and medium portrait, while those same paths on the application site returned
  valid WebP images. A test verifies every declared portrait variant exists in
  the frontend's public assets.
