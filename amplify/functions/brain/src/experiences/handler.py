from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
from aws_lambda_powertools import Logger
import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from requests.auth import AuthBase

from experiences.base import ExperienceContext
from experiences.registry import ExperienceRegistry, normalize_experience_id

logger = Logger()

dynamodb = boto3.resource("dynamodb")
dynamodb_client = boto3.client("dynamodb")

conversation_table_name = os.getenv("CONVERSATION_TABLE_NAME")
conversation_table = (
    dynamodb.Table(conversation_table_name) if conversation_table_name else None
)

appsync_api_url = os.getenv("APPSYNC_API_URL")
appsync_region = os.getenv("AWS_REGION_NAME", os.getenv("AWS_REGION", "us-east-1"))


class _AWSV4Auth(AuthBase):
    def __init__(self, service: str, region: str):
        session = boto3.Session()
        creds = session.get_credentials()
        self.credentials = creds.get_frozen_credentials()
        self.region = region
        self.service = service

    def __call__(self, r):
        cleaned = {k: v for k, v in r.headers.items() if k.lower() != "connection"}
        aws_request = AWSRequest(method=r.method, url=r.url, data=r.body, headers=cleaned)
        SigV4Auth(self.credentials, self.service, self.region).add_auth(aws_request)
        r.headers.update(dict(aws_request.headers))
        return r


def _get_experience_for_conversation(conversation_id: str) -> str:
    if not conversation_table:
        logger.warning("Conversation table not available; defaulting to brain.")
        return "brain"
    try:
        response = conversation_table.get_item(Key={"id": conversation_id})
        raw_mode = response.get("Item", {}).get("personalityMode", "brain")
        return normalize_experience_id(raw_mode)
    except Exception as error:
        logger.exception(
            "Failed to fetch experience for conversation",
            extra={"conversation_id": conversation_id, "error": str(error)},
        )
        return "brain"


def _save_brain_response(
    conversation_id: str,
    message_id: str,
    owner: str,
    response_text: str,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    if not (appsync_api_url and message_id and owner):
        logger.warning("AppSync not configured; skipping BrainResponse save")
        return None

    meta = metadata or {}
    brain_response_id = str(uuid.uuid4())

    mutation = """
    mutation CreateBrainResponse($input: CreateBrainResponseInput!) {
      createBrainResponse(input: $input) {
        id
        response
        conversationId
        messageId
        owner
        sensations
        thoughts
        memories
        selfReflection
      }
    }
    """
    variables = {
        "input": {
            "id": brain_response_id,
            "conversationId": conversation_id,
            "messageId": message_id,
            "response": response_text,
            "sensations": meta.get("sensations", []),
            "thoughts": meta.get("thoughts", []),
            "memories": meta.get("memories", ""),
            "selfReflection": meta.get("self_reflection", ""),
            "owner": owner,
        }
    }

    try:
        auth = _AWSV4Auth(service="appsync", region=appsync_region)
        resp = requests.post(
            appsync_api_url,
            json={"query": mutation, "variables": variables},
            auth=auth,
            timeout=10,
        )
        result = resp.json()
        if "errors" in result:
            logger.error(
                "BrainResponse mutation failed",
                extra={"errors": result["errors"]},
            )
            return None
        logger.info(
            "BrainResponse saved",
            extra={"brain_response_id": brain_response_id, "conversation_id": conversation_id},
        )
        return brain_response_id
    except Exception as exc:
        logger.error(
            "Failed to save BrainResponse via AppSync",
            extra={"error": str(exc)},
        )
        return None


def _is_default_title(title: str | None, experience: str) -> bool:
    normalized = (title or "").strip()
    if not normalized:
        return True
    lowered = normalized.lower()
    if lowered in {"new interaction", "untitled interaction", "new chat", "untitled chat"}:
        return True
    return False


def _maybe_generate_title(
    experience_instance: Any,
    conversation_id: str,
    user_input: str,
    response_text: str,
) -> None:
    if not conversation_table:
        return
    try:
        response = conversation_table.get_item(Key={"id": conversation_id})
        conversation = response.get("Item", {})
    except Exception as error:
        logger.exception("Failed to fetch conversation for title generation", extra={"error": str(error)})
        return

    current_title = conversation.get("title")
    if not _is_default_title(current_title, experience_instance.experience_id):
        return

    title_prompt = (
        "You create concise conversation titles.\n"
        "Based on the first interaction, produce one title that summarizes the topic.\n"
        "Rules:\n"
        "- 3 to 7 words\n"
        "- Plain text title case\n"
        "- No emojis\n"
        "- No surrounding quotes\n"
        "Return valid JSON only: {\"title\": \"...\"}\n\n"
        f"User message: {user_input[:500]}\n"
        f"Assistant response: {response_text[:900]}"
    )
    try:
        import boto3 as _boto3
        import json as _json
        client = _boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
        model_id = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
        result = client.invoke_model(
            modelId=model_id,
            body=_json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 50,
                "messages": [{"role": "user", "content": title_prompt}],
                "temperature": 0.2,
            }),
        )
        raw = _json.loads(result["body"].read())
        content = raw.get("content", [])
        raw_title = content[0].get("text", "") if content else ""
        try:
            parsed = _json.loads(raw_title)
            generated_title = parsed.get("title", "").strip()
        except _json.JSONDecodeError:
            generated_title = raw_title.strip().strip('"\'')

        if generated_title:
            conversation_table.update_item(
                Key={"id": conversation_id},
                UpdateExpression="SET title = :title, updatedAt = :updatedAt",
                ExpressionAttributeValues={
                    ":title": generated_title[:80],
                    ":updatedAt": datetime.now(timezone.utc).isoformat(),
                },
            )
            logger.info("Auto-generated title", extra={"conversation_id": conversation_id, "title": generated_title})
    except Exception as error:
        logger.warning("Title generation failed", extra={"error": str(error)})


@logger.inject_lambda_context
def main(event: dict, context: Any) -> dict:
    """Lambda handler that routes DynamoDB stream events to the
    appropriate Experience implementation based on the experience field."""
    responses = []

    for record in event.get("Records", []):
        event_name = record.get("eventName")
        if event_name not in ("INSERT", "MODIFY"):
            continue

        new_image = record["dynamodb"].get("NewImage", {})
        user_input = new_image.get("content", {}).get("S")
        conversation_id = new_image.get("conversationId", {}).get("S")
        message_id = new_image.get("id", {}).get("S")
        owner = new_image.get("owner", {}).get("S")

        if not (user_input and conversation_id and owner):
            logger.warning(
                "Missing required fields",
                extra={
                    "has_user_input": bool(user_input),
                    "has_conversation_id": bool(conversation_id),
                    "has_owner": bool(owner),
                },
            )
            continue

        experience_id = _get_experience_for_conversation(conversation_id)

        logger.info(
            "Processing message",
            extra={
                "conversation_id": conversation_id,
                "message_id": message_id,
                "owner": owner,
                "experience": experience_id,
            },
        )

        try:
            experience_instance = ExperienceRegistry.create_instance(
                experience_id,
                dynamodb_resource=dynamodb,
                dynamodb_client=dynamodb_client,
            )
        except ValueError as err:
            logger.error("Experience routing failed: %s", err)
            responses.append({"conversation_id": conversation_id, "error": str(err)})
            continue

        ctx = ExperienceContext(
            conversation_id=conversation_id,
            user_input=user_input,
            message_id=message_id,
            owner=owner,
            experience=experience_id,
        )

        experience_response = experience_instance.process_message(ctx)

        _save_brain_response(
            conversation_id=conversation_id,
            message_id=message_id,
            owner=owner,
            response_text=experience_response.response,
            metadata=experience_response.metadata,
        )

        if event_name == "INSERT":
            conversation_response = conversation_table.get_item(Key={"id": conversation_id}) if conversation_table else {}
            conv = conversation_response.get("Item", {}) if conversation_response else {}
            history_count = len(ctx.conversation_history)
            is_first = event_name == "INSERT" and history_count <= 1
            if is_first:
                _maybe_generate_title(
                    experience_instance,
                    conversation_id,
                    user_input,
                    experience_response.response,
                )

        responses.append({
            "conversation_id": conversation_id,
            "experience": experience_id,
            "response_preview": experience_response.response[:100],
        })

    logger.info("Processed %d records", len(responses))
    return {"statusCode": 200, "body": json.dumps(responses)}
