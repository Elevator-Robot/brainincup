import json
import logging
import random
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)


class AgentCoreClient:
    """Thin wrapper around the Amazon Bedrock AgentCore Runtime API."""

    def __init__(
        self,
        runtime_arn: str,
        region_name: str,
        trace_enabled: bool = False,
        trace_sample_rate: float = 0.0,
    ) -> None:
        if not runtime_arn:
            raise ValueError("runtime_arn must be provided")

        self.runtime_arn = runtime_arn
        self.trace_enabled = trace_enabled
        self.trace_sample_rate = max(0.0, min(trace_sample_rate, 1.0))
        self.client = boto3.client(
            "bedrock-agentcore",
            region_name=region_name,
            config=Config(retries={"max_attempts": 3, "mode": "standard"}),
        )

    def invoke(
        self,
        *,
        session_id: str,
        payload: Dict[str, Any],
        trace_metadata: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not session_id:
            raise ValueError("session_id must be provided")

        body = json.dumps(payload)
        request: Dict[str, Any] = {
            "agentRuntimeArn": self.runtime_arn,
            "runtimeSessionId": session_id,
            "payload": body,
        }

        if self._should_send_trace() and trace_metadata:
            request["traceId"] = trace_metadata

        response = self.client.invoke_agent_runtime(**request)
        decoded = self._decode_response(response)
        logger.debug(
            "AgentCore invocation complete",
            extra={"session_id": session_id, "content_type": response.get("contentType")},
        )
        return decoded

    def _should_send_trace(self) -> bool:
        if not self.trace_enabled:
            return False
        if self.trace_sample_rate <= 0:
            return True
        return random.random() <= self.trace_sample_rate

    def _decode_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        content_type = response.get("contentType", "application/json") or "application/json"
        body = response.get("response")
        if body is None:
            return {}

        raw_bytes = self._read_stream(body)
        if "text/event-stream" in content_type:
            raw_text = self._strip_sse_prefixes(raw_bytes.decode("utf-8"))
        else:
            raw_text = raw_bytes.decode("utf-8")

        raw_text = raw_text.strip()
        if not raw_text:
            return {}

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            logger.warning("AgentCore response was not valid JSON; returning raw text")
            return {"response": raw_text}

    @staticmethod
    def _read_stream(body) -> bytes:
        try:
            data = body.read()
        except AttributeError:
            if isinstance(body, (bytes, bytearray)):
                return bytes(body)
            raise
        finally:
            try:
                body.close()
            except AttributeError:
                pass
        return data or b""

    @staticmethod
    def _strip_sse_prefixes(raw_text: str) -> str:
        data_lines = []
        for line in raw_text.splitlines():
            if line.startswith("data: "):
                data_lines.append(line[6:])
        return "".join(data_lines) if data_lines else raw_text
