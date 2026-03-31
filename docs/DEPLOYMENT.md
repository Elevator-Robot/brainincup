# Deployment Guide

## Quick Start

Deploy everything with a single command:

```bash
npm run deploy
```

That's it! The script will automatically:
1. ✅ Detect your AWS account ID
2. ✅ Build the Lambda layer
3. ✅ Check if AgentCore container exists
4. ✅ Build and push container if needed
5. ✅ Deploy the Amplify sandbox with AgentCore runtime

## Prerequisites

- **Docker** running locally
- **AWS CLI** configured with credentials
- **AWS Profile** named `brain` (or set `AWS_PROFILE` env var)
- Node.js 18+ and npm

## Environment Configuration

All configuration is auto-detected! No hardcoded values needed.

Optional settings in `.env.agentcore`:
- `AGENTCORE_NETWORK_MODE`: `PUBLIC` or `VPC` (default: `PUBLIC`)
- `AGENTCORE_TRACE_ENABLED`: Enable tracing (default: `false`)
- `AGENTCORE_TRACE_SAMPLE_RATE`: Trace sample rate 0.0-1.0 (default: `0.0`)

## Individual Commands

If you need more control:

### Build and Push AgentCore Container Only
```bash
./scripts/update-agent-image.sh
```

### Deploy Without Rebuilding Container
```bash
npm run sandbox
```

### View Live Logs
```bash
npm run logs
```

### Delete Sandbox
```bash
npm run sandbox:delete
```

## How It Works

### First Deployment
1. Builds AgentCore Docker container from `agent-runtime/`
2. Pushes to ECR (auto-detected: `{account}.dkr.ecr.us-east-1.amazonaws.com/brain-agent`)
3. Creates `AWS::BedrockAgentCore::Runtime` with the container
4. Deploys Lambda, DynamoDB, AppSync, Cognito, etc.

### Subsequent Deployments
- Reuses existing container if found
- Updates AgentCore runtime if container changed
- Hotswaps Lambda code for faster deploys

## Authentication Setup (Optional)

### External OAuth Providers

To enable Google and Facebook login:

1. **Configure secrets in AWS Parameter Store**:
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

2. **Deploy normally**:
   ```bash
   npm run deploy
   ```

### Development Without External Providers

Set `AMPLIFY_EXTERNAL_PROVIDERS=false` to use default values:

```bash
AMPLIFY_EXTERNAL_PROVIDERS=false npm run deploy
```

## Troubleshooting

### "Could not determine AWS account ID"
Make sure AWS credentials are configured:
```bash
aws sts get-caller-identity --profile brain
```

### "Docker is not running"
Start Docker Desktop and try again.

### "ECR repository does not exist"
The script will create it automatically on first run.

### AgentCore Runtime Errors
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

### Lambda Layer Build Issues

If you see import errors like "No module named 'pydantic_core._pydantic_core'":

```bash
./scripts/build-lambda-layer.sh
```

This rebuilds Python dependencies compatible with AWS Lambda.

## CI/CD

For automated deployments, set these environment variables:
- `AWS_REGION` (default: `us-east-1`)
- `AWS_PROFILE` (default: `brain`)
- `REPO` (default: `brain-agent`)
- `IMAGE_TAG` (default: `latest`)

Example GitHub Actions:
```yaml
- name: Deploy
  env:
    AWS_REGION: us-east-1
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: npm run deploy
```

## Architecture

### AgentCore Runtime
Brain uses AWS Bedrock AgentCore for managed AI agent execution:
- Container: Custom Python runtime with LangChain
- Memory: Persistent conversation context and world state
- Tools: Function calling for game mechanics

### Backend Stack
- **Lambda**: Main Brain function with AgentCore client
- **DynamoDB**: Game state, conversations, quest logs
- **AppSync**: GraphQL API with real-time subscriptions
- **Cognito**: User authentication and authorization
- **CloudWatch**: Logging and monitoring

**Troubleshooting:**
- See `scripts/README.md` for detailed documentation
- See `amplify/functions/brain/README.md` for function-specific details
- If you see import errors for aws_lambda_powertools or pydantic, rebuild the layer
- Make sure Docker is running before executing the script

## Deployment Options

### Option 1: Local Development Deployment (Recommended)

Deploy with default values for external authentication providers:

```bash
npm run sandbox:local
```

This sets `AMPLIFY_EXTERNAL_PROVIDERS=false` and uses default values for Google/Facebook secrets, allowing deployment to succeed without configuring real secrets.

### Option 2: Production Deployment

Deploy with all external providers (requires secrets to be configured):

```bash
npm run sandbox
```

### Option 3: Using the Deployment Script

```bash
# For development
./scripts/sandbox-deploy.sh --no-external-providers

# For production
./scripts/sandbox-deploy.sh
```

### Option 4: Manual Environment Variable Control

```bash
# Disable external providers
AMPLIFY_EXTERNAL_PROVIDERS=false npx ampx sandbox

# Enable external providers (default)
AMPLIFY_EXTERNAL_PROVIDERS=true npx ampx sandbox
```

## Setting Up External Provider Secrets

When you're ready to enable external providers, configure the required secrets:

```bash
# Set Google secrets
npx ampx sandbox secret set GOOGLE_CLIENT_ID
npx ampx sandbox secret set GOOGLE_CLIENT_SECRET

# Set Facebook secrets
npx ampx sandbox secret set FACEBOOK_CLIENT_ID
npx ampx sandbox secret set FACEBOOK_CLIENT_SECRET
```

Then deploy with external providers enabled:

```bash
npm run sandbox
```

## CI/CD Integration

For CI/CD pipelines where external provider secrets might not be available:

```yaml
# GitHub Actions example
- name: Deploy Amplify Sandbox
  run: AMPLIFY_EXTERNAL_PROVIDERS=false npx ampx sandbox --once
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Configuration Details

The authentication configuration in `amplify/auth/resource.ts` uses conditional logic:

```typescript
const shouldIncludeExternalProviders = process.env.AMPLIFY_EXTERNAL_PROVIDERS !== 'false';

export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: shouldIncludeExternalProviders 
      ? externalProvidersWithSecrets 
      : baseExternalProviders
  },
  // ... rest of configuration
});
```

## Troubleshooting

**Q: I'm getting "Failed to retrieve backend secret" errors**
A: Use `npm run sandbox:no-external` to deploy without external providers

**Q: External providers aren't working after deployment**
A: Make sure you've configured the required secrets and deployed with `npm run sandbox`

**Q: How do I know if external providers are enabled?**
A: Check the console output during deployment for the warning message

**Q: Can I switch between modes after deployment?**
A: Yes, just redeploy with the desired configuration using the appropriate script