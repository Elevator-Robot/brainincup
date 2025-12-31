# AgentCore Runtime vs. LangChain-in-Lambda Performance (2025-12-31T18:21:24.733Z)

## Summary
Migrating Brain In Cup from a LangChain-only Lambda workflow to an Amazon Bedrock AgentCore runtime reduces end-to-end latency, simplifies scaling, and unlocks enterprise observability. AgentCore keeps agent processes warm inside AWS-managed microVMs, so our Lambda function now only formats prompts and forwards them via `bedrock-agentcore:InvokeAgentRuntime`, eliminating multi-format retries and cold-start penalties.

## Old Architecture: LangChain in Lambda
- **Execution**: Perception/Language agents constructed prompts and called `ChatBedrock` directly inside the Lambda handler. Every invocation pulled dependencies from the custom layer, parsed outputs, and retried across four payload shapes.
- **Cold Starts**: Python + LangChain imports (langchain_core, langchain_aws, etc.) increased cold-start time, especially when the Lambda scale spiked due to DynamoDB stream bursts.
- **Tooling/Policies**: Any new tool or policy had to be coded by hand (Python wrappers, IAM, retries). There was no central audit trail or tracing of agent steps.
- **Observability**: Limited to CloudWatch logs + Powertools metrics; no built-in trace of thought or JSON schema compliance.

## New Architecture: AgentCore Runtime
- **Execution**: Lambda still constructs persona prompts, but `LanguageAgent` now invokes an AgentCore runtime. The runtime hosts the actual agent code (prompt orchestration, policy enforcement, tool calls) inside a Bedrock-managed microVM.
- **Warm State**: AgentCore manages session isolation and keeps runtimes warm. AWS handles concurrency and scaling, so we avoid repeated interpreter/layer initialization.
- **Policies & Memory**: AgentCore exposes managed policy, identity, and memory surfaces, so the agent enforces guardrails without extra Lambda code.
- **Observability**: AgentCore includes tracing and evaluation hooks; we can track JSON schema compliance, latency, tool invocations, and policy hits directly from AWS dashboards.

## Expected Performance Gains
| Dimension | LangChain-in-Lambda | AgentCore Runtime | Impact |
| --- | --- | --- | --- |
| Cold Start | Python + LangChain import (~100s of MB) | Thin Lambda + managed runtime | Faster first-byte response |
| Prompt Handling | Hand-written retries, blocking in Lambda | Runtime handles protocols + streaming | Reduced latency variance |
| Scaling | Lambda concurrency tied to stream batch size | AgentCore auto-scales runtimes | Higher throughput, less throttling |
| Tool Onboarding | Manual Python wrappers per tool | AgentCore Gateway + MCP/A2A | Faster feature delivery |
| Observability | Custom logs only | Built-in traces, evals, metrics | Faster debugging |

## Cost Considerations (2025-12-31T18:27:13.148Z)
- **LangChain-in-Lambda**: You only pay for Lambda compute + Bedrock model usage, but frequent cold starts (importing LangChain, retries) can drive up execution time. You also shoulder engineering cost for tooling, policies, and monitoring.
- **AgentCore Runtime**: Adds AgentCore runtime-hours and storage charges on top of Bedrock model costs, so the AWS bill may be higher if the runtime stays allocated long-term. However, faster responses reduce Lambda duration, and built-in observability/policy controls cut custom infrastructure spend. Net cost depends on runtime utilization—higher traffic and always-on agents favor AgentCore, while extremely low QPS workloads may remain cheaper on pure Lambda.

## Operational Notes
1. **Runtime Deployment**: Provide `AGENTCORE_CONTAINER_URI` (ECR image built per AWS AgentCore packaging guide) before `npm run sandbox*`. The Amplify/CDK stack now provisions `AWS::BedrockAgentCore::Runtime` and injects its ARN automatically.
2. **Fallback Path**: Setting `AGENTCORE_RUNTIME_ARN` directly continues to work if you host a runtime outside this stack.
3. **Layer Trimmed**: Lambda layer now carries only `aws-lambda-powertools`, `pydantic`, and `requests`, reducing package size.
4. **Monitoring**: Use AgentCore observability dashboards for trace-level insight; CloudWatch continues to capture Lambda wrapper logs.

## Next Steps
1. Build/push the AgentCore runtime container image with your agent entrypoint.
2. Export `AGENTCORE_CONTAINER_URI` (or provide an existing `AGENTCORE_RUNTIME_ARN`) before redeploying via Amplify.
3. Verify Lambda logs to confirm the runtime ARN is injected, then monitor AgentCore metrics for latency improvements.
4. Decommission legacy LangChain dependencies once runtime traffic is stable.
