# Chat outage: Bedrock cross-region access

## Current repair: user-selected GPT OSS 120B

The later regional request identified an account entitlement restriction, not
another cross-region failure. On October 18 at 18:45:49 UTC, Mantle returned:

```text
403 permission_error
anthropic.claude-haiku-4-5 is not available for this account.
```

The individual model GET confirmed `status: unavailable`; the earlier generic
catalog listing and Bedrock foundation-model availability were insufficient to
establish Mantle access. The user selected **GPT OSS 120B** as the replacement.
Its individual model GET reports `status: available` in us-east-1.

Active configuration:

```text
Model: openai.gpt-oss-120b
Endpoint: https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions
```

The shared transport converts the existing prompt format into Chat Completions,
including the system message. It converts final-answer text back to the response
shapes used by Brain, GM, and title generation. Separate model reasoning fields
are ignored. Low reasoning effort and additional completion-token headroom avoid
exhausting short title budgets before visible output. Streaming requires visible
text and `finish_reason: stop`; `[DONE]` is optional. Final buffered SSE frames
are processed at EOF. A complete JSON response to a streaming request is also
accepted after the same checks; empty, truncated, and error responses fail.

Deployment defaults, previous Haiku environment settings, and the IAM model
condition migrate together. SigV4, default-project scoping, diagnostics, and
us-east-1-only enforcement remain in place. No live inference was invoked during
the read-only investigation; verify Brain, GM, and titles after deployment.

Reference: [AWS GPT OSS 120B model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-oss-120b.html).

### Stream completion follow-up

After PR #204 deployed, the request at 19:06:54 UTC reached the regional endpoint
with HTTP 200 but failed locally with `Regional inference stream ended before
[DONE]`. The parser previously dropped a final buffered frame at EOF and required
a transport terminator even after a valid model completion.

The parser now flushes EOF frames and accepts a normal model-completion signal
with visible output. `[DONE]` alone cannot turn partial output into success.
Incomplete-stream diagnostics record content type, service request ID, event
count, EOF-frame presence, completion state, and text presence without content.
The original logs do not reveal which framing variation caused that request;
regression tests cover these cases without assuming every EOF is successful.

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

## Initial regional Claude repair (superseded)

The first repair kept Claude Haiku 4.5 but used its regional Mantle Messages API:

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

Initial read-only verification found Mantle's us-east-1 model catalog reporting
`anthropic.claude-haiku-4-5` as `available`, but the later individual-model check
and actual request contradicted that summary. The account has an active default
project. IAM simulation allowed `bedrock-mantle:CreateInference` on that project
with the us-east-1 and model conditions, including the Organizations decision.
The deployment declares that project-scoped permission with both conditions;
it no longer declares cross-region Bedrock inference permissions.

After deploying the regional configuration, verify a new message in each chat
mode and check that the associated Lambda logs no longer contain the access
denial. No AWS policy changes were applied during this investigation.

Reference: [Bedrock geographic cross-region inference](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).

## Follow-up: regional HTTP 403 after deployment

PR #202 deployed successfully in Amplify job 137 on October 18 at 18:28:58 UTC.
The deployed transport matches commit `9bd8bdb`, and the Lambda environment uses
`us-east-1` and `anthropic.claude-haiku-4-5`.

A subsequent GM request at 18:30:33 UTC failed with HTTP 403 from the regional
Mantle Messages URL. The previous logging recorded only `raise_for_status()`'s
generic exception; the service's error code, reason, and request ID were lost.
IAM simulation still allowed the action, including the Organizations decision,
so this status alone does not establish an IAM, signing, or entitlement cause.

The transport now logs selected service error fields and request IDs for
non-200 responses, bounds and sanitizes them, and excludes raw bodies and
headers. After deploying these diagnostics, reproduce one failed chat request
and inspect `Regional inference rejected` in the Lambda logs. This diagnostic
change does not itself fix the HTTP 403.

## Application fixes

- Brain and GM now share the same technical-difficulties message. GM emits the
  same failure text in its live stream and persisted response.
- Character portraits use `/images/avatars/` assets shipped with the frontend.
  The configured separate CDN returned 404 for the tested original, thumbnail,
  and medium portrait, while those same paths on the application site returned
  valid WebP images. A test verifies every declared portrait variant exists in
  the frontend's public assets.
