import json
import logging
import re
from typing import Any, Dict, Iterator, List, Optional

import boto3

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


class BedrockDirectClient:
    """Direct Bedrock model invocation, replaces AgentCore container round-trip.

    This client calls Bedrock's invoke_model directly instead of routing
    through the AgentCore managed runtime. The agent-runtime/ directory and
    Dockerfile are preserved for easy fallback.

    Implements the same interface as AgentCoreClient for duck-typed compatibility.
    AgentCore-specific memory methods are no-ops in direct mode.
    """

    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        region_name: str = "us-east-1",
    ) -> None:
        self.model_id = model_id
        self.client = boto3.client("bedrock-runtime", region_name=region_name)

    def invoke(
        self,
        *,
        session_id: str,
        payload: Dict[str, Any],
        trace_metadata: Optional[str] = None,
        runtime_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        prompt = payload.get("prompt", "")
        persona = payload.get("persona", {})
        temperature = float(persona.get("temperature", 1.0))
        top_p = float(persona.get("top_p", 1.0))

        system_prompt = persona.get("name", "You are a helpful AI assistant.")

        bedrock_request = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }

        try:
            response = self.client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(bedrock_request),
            )
            model_response = json.loads(response["body"].read())
            content = model_response.get("content", [])
            if content and isinstance(content, list) and len(content) > 0:
                raw_text = content[0].get("text", "")
            else:
                raw_text = ""
                logger.error("Bedrock returned empty content", extra={"model_id": self.model_id, "response": model_response})

            try:
                return json.loads(raw_text)
            except json.JSONDecodeError:
                return {"response": raw_text}

        except Exception as error:
            logger.error("Bedrock direct invocation failed", extra={"model_id": self.model_id, "error_type": type(error).__name__}, exc_info=error)
            return {
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties",
                "response": "I'm experiencing technical difficulties and cannot process your request at the moment.",
            }

    def invoke_stream(
        self,
        *,
        session_id: str,
        payload: Dict[str, Any],
        trace_metadata: Optional[str] = None,
        runtime_user_id: Optional[str] = None,
    ) -> Iterator[str]:
        """Invoke Bedrock with streaming and yield incremental text deltas."""
        prompt = payload.get("prompt", "")
        persona = payload.get("persona", {})
        temperature = float(persona.get("temperature", 1.0))
        top_p = float(persona.get("top_p", 1.0))

        system_prompt = persona.get("name", "You are a helpful AI assistant.")

        bedrock_request = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }

        try:
            response = self.client.invoke_model_with_response_stream(
                modelId=self.model_id,
                body=json.dumps(bedrock_request),
            )
            for event in response["body"]:
                chunk = event.get("chunk")
                if not chunk:
                    continue
                decoded = chunk.get("bytes")
                if not decoded:
                    continue
                try:
                    content_block = json.loads(decoded)
                except (TypeError, json.JSONDecodeError):
                    continue
                if content_block.get("type") == "content_block_delta":
                    delta = content_block.get("delta") or {}
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        yield delta["text"]
                elif content_block.get("type") == "content_block_start":
                    block = content_block.get("content_block") or {}
                    if block.get("type") == "text" and block.get("text"):
                        yield block["text"]
        except Exception as error:
            logger.error(
                "Bedrock streaming invocation failed",
                extra={"model_id": self.model_id, "error_type": type(error).__name__},
                exc_info=error,
            )
            raise

    # ------------------------------------------------------------------ #
    # AgentCore-compatible stubs (memory methods are no-ops in direct mode)
    # ------------------------------------------------------------------ #

    def retrieve_memory_records(
        self,
        *,
        namespace: str,
        search_query: str,
        top_k: int = 5,
        memory_strategy_id: Optional[str] = None,
    ) -> List[str]:
        logger.debug("Memory retrieval is not available in direct Bedrock mode (namespace=%s)", namespace)
        return []

    def create_short_term_event(
        self,
        *,
        actor_id: str,
        session_id: str,
        role: str,
        text: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> None:
        pass

    def save_memory_record(
        self,
        *,
        request_identifier: str,
        namespaces: List[str],
        content_text: str,
        memory_strategy_id: Optional[str] = None,
    ) -> None:
        pass

    @staticmethod
    def sanitize_namespace(value: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_-]", "-", value or "").strip("-")
        if not cleaned:
            return "default"
        return cleaned[:128]
