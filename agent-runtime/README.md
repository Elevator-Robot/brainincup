# AgentCore Runtime for Brain In Cup

This directory contains the Amazon Bedrock AgentCore runtime implementation for the Brain In Cup agent.

## Structure
```
agent-runtime/
├── app/
│   ├── __init__.py          # Package marker
│   ├── main.py              # AgentCore entrypoint handler
│   └── requirements.txt     # Runtime dependencies
├── scripts/
│   └── start.sh             # Optional bootstrap script
├── Dockerfile               # Container image definition
└── README.md               # This file
```

## Building and Updating the Image

After making changes to the agent code, rebuild and push the container:

**Quick update:**
```bash
./scripts/update-agent-image.sh
```

**Manual steps** (if you prefer):
   ```bash
   export AWS_REGION=us-east-1
   export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   export REPO=brain-agent
   ```

2. **Create ECR repository** (if not exists):
   ```bash
   aws ecr create-repository --repository-name $REPO --region $AWS_REGION || true
   ```

3. **Login to ECR**:
   ```bash
   aws ecr get-login-password --region "$AWS_REGION" \
     | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
   ```

4. **Build the image**:
   ```bash
   docker build -t $REPO:latest ./agent-runtime
   ```

5. **Tag and push**:
   ```bash
   docker tag $REPO:latest "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
   docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
   ```

6. **Record the URI**:
   ```bash
   export AGENTCORE_CONTAINER_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
   echo $AGENTCORE_CONTAINER_URI
   ```

## Testing Locally

Run the container locally to test before pushing:
```bash
docker run --rm -p 8080:8080 \
  -e LOG_LEVEL=DEBUG \
  -e BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0 \
  $REPO:latest
```

Or test the handler directly:
```bash
cd agent-runtime
python -m app.main
```

## Deploying to Amplify

After pushing the image to ECR:
```bash
export AGENTCORE_CONTAINER_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
export AGENTCORE_RUNTIME_NAME=BrainInCupRuntime
export AGENTCORE_NETWORK_MODE=PUBLIC

cd ..
npm run sandbox
```

The Amplify/CDK stack will provision the `AWS::BedrockAgentCore::Runtime` and inject its ARN into the Lambda automatically.

## Next Steps

1. **Implement real model invocation** in `app/main.py`:
   - Replace the stub response with actual Bedrock runtime API calls
   - Use `boto3.client('bedrock-runtime').invoke_model()` to call Claude/Sonnet
   - Parse the model response and format it per the JSON schema

2. **Add tool support** (optional):
   - Register tools via AgentCore Gateway
   - Implement tool handlers in the runtime

3. **Enable memory** (optional):
   - Use AgentCore Memory API to persist conversation context
   - Remove ad-hoc context stitching from Lambda

## References
- [AWS::BedrockAgentCore::Runtime CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrockagentcore-runtime.html)
- [AgentCore Runtime Getting Started](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-getting-started.html)
- [AgentCore Starter Toolkit](https://aws.github.io/bedrock-agentcore-starter-toolkit/)
