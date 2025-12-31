# AgentCore Runtime Setup & Preparation (2025-12-31T18:30:29.697Z)

Use this guide to package the Brain In Cup agent as a container image consumable by `AWS::BedrockAgentCore::Runtime`. It summarizes the requirements from the official Bedrock AgentCore runtime documentation so the Amplify/CDK stack can provision the runtime automatically when `AGENTCORE_CONTAINER_URI` is supplied.

## 1. Prerequisites
- AWS account with Amazon Bedrock AgentCore access enabled in the target region.
- Docker 24+ (or compatible builder) installed locally or in CI.
- ECR repository dedicated to the agent runtime image, e.g., `123456789012.dkr.ecr.us-east-1.amazonaws.com/brain-agent`.
- Agent source code implementing the AgentCore runtime contract (Python SDK via `@app.entrypoint` or equivalent HTTP handler).
- IAM permissions to push to ECR and to deploy `AWS::BedrockAgentCore::Runtime` via CloudFormation/CDK.

## 2. Runtime Layout
```
agent-runtime/
├── app/
│   ├── __init__.py
│   ├── main.py          # defines @app.entrypoint handler
│   └── requirements.txt # only runtime deps (e.g., boto3, strands-agents)
├── scripts/
│   └── start.sh         # optional custom bootstrap
├── Dockerfile
└── README.md
```
Key expectations from AWS docs:
- Your entrypoint must expose a callable that accepts AgentCore runtime events and returns JSON-serializable responses.
- The handler must be reachable via the command you set in `ENTRYPOINT`/`CMD`.
- Use a slim base image (e.g., `public.ecr.aws/docker/library/python:3.11-slim`) and install only runtime dependencies.

## 3. Sample Dockerfile
```Dockerfile
FROM public.ecr.aws/docker/library/python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY app/ ./app
COPY app/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# If using the official AgentCore Python SDK, expose the entrypoint module here.
CMD ["python", "-m", "app.main"]
```
Adjust the command if you prefer `gunicorn` or another runtime process. Ensure the process binds to the port/protocol expected by your AgentCore protocol configuration (HTTP, MCP, etc.).

## 4. Build & Push
```bash
AWS_REGION=us-east-1
ACCOUNT_ID=123456789012
REPO=brain-agent

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t $REPO:latest ./agent-runtime

docker tag $REPO:latest "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"

docker push "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO:latest"
```
Record the pushed URI; you’ll pass it to Amplify/CDK via `AGENTCORE_CONTAINER_URI` before deployment.

## 5. Configuring Amplify/CDK
After pushing the image:
```bash
export AGENTCORE_CONTAINER_URI=123456789012.dkr.ecr.us-east-1.amazonaws.com/brain-agent:latest
export AGENTCORE_RUNTIME_NAME=BrainInCupRuntime    # optional
export AGENTCORE_NETWORK_MODE=PUBLIC              # or VPC_PRIVATE
npm run sandbox                                    # or sandbox:local
```
The stack now provisions `AWS::BedrockAgentCore::Runtime`, assigns it a managed role, and injects the resulting ARN into the Lambda environment.

## 6. Best Practices
1. **Pin Dependencies** – Lock versions in `requirements.txt` to keep runtime images reproducible.
2. **Health Logging** – Emit structured logs (JSON) from your entrypoint so AgentCore observability surfaces show rich traces.
3. **Secrets** – Pull secrets from AWS Secrets Manager or environment variables injected by AgentCore (avoid baking secrets into the image).
4. **Small Images** – Use multi-stage builds if you compile native dependencies; copy only the final artifacts into the runtime layer.
5. **Testing** – Run the container locally (`docker run -p 8080:8080 ...`) and hit the entrypoint with sample AgentCore payloads before pushing to ECR.

## 7. References
- [AWS::BedrockAgentCore::Runtime – CloudFormation Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-bedrockagentcore-runtime.html)
- [AgentCore Runtime – Getting Started (Official Docs)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-getting-started.html)
- [AgentCore Runtime Direct Code Deploy Guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy.html)
- [AgentCore Starter Toolkit](https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/create/quickstart.html)
