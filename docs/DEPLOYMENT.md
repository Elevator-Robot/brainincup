# Deployment Guide

## Quick Start

Deploy everything with a single command:

```bash
npm run deploy:all
```

That's it! The script will:
1. ✅ Detect your AWS account ID
2. ✅ Build the Lambda layer
3. ✅ Deploy the Amplify sandbox
4. ✅ Sync images to CDN

No Docker required.

## Prerequisites

- **AWS CLI** configured with credentials
- **AWS Profile** named `brain` (or set `AWS_PROFILE` env var)
- Node.js 18+ and npm

## Deployment Mode: Direct Code (Default)

The Lambda function calls Bedrock directly. There is no separate AgentCore container
runtime — the model invocation code is bundled with the Lambda. This eliminates the
Docker build step from the dev loop.

### Deploy

```bash
npm run deploy:sandbox    # Build layer + deploy Amplify sandbox
npm run deploy:images     # Sync game images to CDN
npm run deploy:all        # Both of the above
```

### View Live Logs

```bash
npm run logs
```

### Delete Sandbox

```bash
npm run delete:sandbox
```

## Switching to Container Mode

The original AgentCore container setup is preserved and ready to use. To switch back:

1. **Build and push the container:**
   ```bash
   npm run deploy:container  # Builds Docker image, pushes to ECR, then deploys
   ```

2. **Or step by step:**
   ```bash
   # Build and push the AgentCore container
   ./scripts/update-agent-image.sh

   # Deploy Amplify sandbox (detects AGENTCORE_CONTAINER_URI)
   npm run deploy:sandbox
   ```

3. **To restore the full container deployment pipeline:**
   - Uncomment the AgentCore runtime block in `amplify/backend.ts` (search for "AgentCore")
   - Revert `amplify/functions/brain/app/main.py` to use `invoke_agentcore()` instead of `invoke_bedrock()`
   - See `agent-runtime/README.md` for the container runtime details

## Environment Configuration

Optional settings in `.env.agentcore`:

- `BEDROCK_MODEL_ID`: Bedrock model to use (default: `us.anthropic.claude-haiku-4-5-20251001-v1:0`)
- `AGENTCORE_TRACE_ENABLED`: Enable tracing (default: `true`)
- `AGENTCORE_TRACE_SAMPLE_RATE`: Trace sample rate 0.0-1.0 (default: `1.0`)

## How It Works

### Direct Code Mode (Current)

1. Lambda layer builds Python dependencies for the runtime
2. Amplify sandbox deploys Lambda, DynamoDB, AppSync, Cognito, S3, CloudFront
3. Lambda receives DynamoDB stream events from the Message table
4. Lambda runs the ContextEnrichmentPipeline to build a game context
5. Lambda calls Bedrock directly with the enriched prompt
6. Lambda writes the BrainResponse back via AppSync

### Container Mode (Fallback)

1. Builds AgentCore Docker container from `agent-runtime/`
2. Pushes to ECR
3. Creates `AWS::BedrockAgentCore::Runtime` with the container
4. Lambda routes prompts to AgentCore via HTTP instead of calling Bedrock directly

## Authentication Setup (Optional)

### External OAuth Providers

To enable Google and Facebook login:

1. **Configure secrets in AWS Parameter Store:**
   ```bash
   # Google OAuth
   aws ssm put-parameter --name /amplify/brain-in-cup/GOOGLE_CLIENT_ID \
     --value "your-google-client-id" --type SecureString

   aws ssm put-parameter --name /amplify/brain-in-cup/GOOGLE_CLIENT_SECRET \
     --value "your-google-client-secret" --type SecureString

   # Facebook OAuth
   aws ssm put-parameter --name /amplify/brain-in-cup/FACEBOOK_CLIENT_ID \
     --value "your-facebook-client-id" --type SecureString

   aws ssm put-parameter --name /amplify/brain-in-cup/FACEBOOK_CLIENT_SECRET \
     --value "your-facebook-client-secret" --type SecureString
   ```

2. **Deploy normally:**
   ```bash
   npm run deploy:all
   ```

### Development Without External Providers

```bash
AMPLIFY_EXTERNAL_PROVIDERS=false npm run deploy:sandbox
```

## Troubleshooting

### "Could not determine AWS account ID"
Make sure AWS credentials are configured:
```bash
aws sts get-caller-identity --profile brain
```

### Lambda Layer Build Issues

If you see import errors like "No module named 'pydantic_core._pydantic_core'":

```bash
./scripts/build-lambda-layer.sh
```

This rebuilds Python dependencies compatible with AWS Lambda.

### Bedrock Invocation Errors
Check logs:
```bash
npm run logs
```

Look for errors in CloudFormation:
```bash
aws cloudformation describe-stack-events \
  --stack-name amplify-brainincup-{user}-sandbox-{id} \
  --region us-east-1
```

## Architecture

### Direct Code Runtime
Brain calls Bedrock directly from the Lambda function:
- Lambda: Python runtime with Bedrock SDK
- Model invocations happen inline, no HTTP hop

### Backend Stack
- **Lambda**: Main Brain function with game logic and Bedrock invocation
- **DynamoDB**: Game state, conversations, quest logs
- **AppSync**: GraphQL API with real-time subscriptions
- **Cognito**: User authentication and authorization
- **S3 + CloudFront**: Image CDN
- **CloudWatch**: Logging and monitoring

## CI/CD

For automated deployments:

```yaml
- name: Deploy
  env:
    AWS_REGION: us-east-1
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: npm run deploy:all
```
