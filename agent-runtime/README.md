# AgentCore Runtime for Brain In Cup

This directory contains the Amazon Bedrock AgentCore runtime implementation for the Brain In Cup agent.

## Current Status: Direct Code Mode

The Lambda function now calls Bedrock directly, eliminating the need for a separate
AgentCore container runtime. This directory is **preserved intact** for easy fallback.

## Structure
```
agent-runtime/
├── app/
│   ├── __init__.py          # Package marker
│   ├── main.py              # AgentCore entrypoint handler (FastAPI)
│   └── requirements.txt     # Runtime dependencies
├── Dockerfile               # Container image definition
└── README.md               # This file
```

## Switching to Container Mode

To restore the original AgentCore container deployment:

1. **Revert `amplify/functions/brain/app/main.py`:**
   - Replace `invoke_bedrock()` calls with `invoke_agentcore()` calls
   - Restore the `invoke_agentcore` function (see `main.py.__init__` for reference)

2. **Uncomment the AgentCore runtime block in `amplify/backend.ts`:**
   - Search for "AgentCore" — there's a comment block with instructions
   - This re-creates the `AWS::BedrockAgentCore::Runtime` resource

3. **Build and push the container:**
   ```bash
   export AWS_REGION=us-east-1
   export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   export REPO=brain-agent

   # Create ECR repository (if not exists)
   aws ecr create-repository --repository-name $REPO --region $AWS_REGION || true

   # Login to ECR
   aws ecr get-login-password --region "$AWS_REGION" \
     | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

   # Build the image
   docker build -t $REPO:latest ./agent-runtime

   # Tag and push
   docker tag $REPO:latest "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
   docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
   ```

4. **Or use the npm script:**
   ```bash
   npm run deploy:container
   ```

## Testing Locally

Run the handler directly (works in either mode):
```bash
cd agent-runtime
python -m app.main
```

## References
- [AWS::BedrockAgentCore::Runtime CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-bedrockagentcore-runtime.html)
