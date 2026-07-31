import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class LanguageAgent:
    def __init__(self, agent_client, persona_config: Dict[str, Any]):
        """agent_client: AgentCoreClient or BedrockDirectClient (duck-typed, both implement .invoke())"""
        self.agent_client = agent_client
        self.persona_config = persona_config
        self.memory = []

    def generate_response(
        self,
        formatted_prompt: str,
        *,
        session_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send the prepared payload to the AgentCore runtime and parse the result."""
        metadata = metadata or {}
        payload = self._build_payload(formatted_prompt, metadata)

        try:
            response = self.agent_client.invoke(
                session_id=session_id,
                payload=payload,
                trace_metadata=metadata.get("trace_id"),
                runtime_user_id=metadata.get("owner"),
            )
            if not response:
                logger.error("Agent returned empty response", extra={"session_id": session_id})
                return self._fallback_response()
            if isinstance(response, dict) and "sensations" in response and response.get("sensations") == ["Error processing input"]:
                logger.error("Agent returned error response", extra={"response": response, "session_id": session_id})
                return self._fallback_response()
            return response
        except Exception as error:
            logger.error("Agent invocation failed", exc_info=error)
            return self._fallback_response()

    def generate_response_stream(
        self,
        formatted_prompt: str,
        *,
        session_id: str,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Stream Bedrock text deltas, then yield the parsed structured response.

        Yields {"type": "delta", "text": ...} for each incremental token and a
        final {"type": "complete", "response": <dict>} with the parsed JSON.
        """
        import json as _json

        metadata = metadata or {}
        payload = self._build_payload(formatted_prompt, metadata)

        try:
            chunks = []
            for delta in self.agent_client.invoke_stream(
                session_id=session_id,
                payload=payload,
                trace_metadata=metadata.get("trace_id"),
                runtime_user_id=metadata.get("owner"),
            ):
                chunks.append(delta)
                yield {"type": "delta", "text": delta}

            raw_text = "".join(chunks)
            try:
                parsed = _json.loads(raw_text)
            except _json.JSONDecodeError:
                parsed = {"response": raw_text}
            if not isinstance(parsed, dict):
                parsed = {"response": raw_text}
            yield {"type": "complete", "response": parsed}
        except Exception as error:
            logger.error("Agent streaming invocation failed", exc_info=error)
            yield {"type": "complete", "response": self._fallback_response()}

    def _build_payload(self, formatted_prompt: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "prompt": formatted_prompt,
            "persona": {
                "name": self.persona_config.get("name", "Brain"),
                "mode": metadata.get("personality_mode"),
                "temperature": self.persona_config.get("temperature", 1.0),
                "top_p": self.persona_config.get("top_p", 1.0),
            },
            "context": metadata.get("context"),
            "message": {
                "id": metadata.get("message_id"),
                "owner": metadata.get("owner"),
            },
        }

    @staticmethod
    def _fallback_response() -> Dict[str, Any]:
        return {
            "sensations": ["Error processing input"],
            "thoughts": ["System malfunction"],
            "memories": "Unable to access memory banks",
            "self_reflection": "Experiencing technical difficulties",
            "response": "I'm experiencing technical difficulties and cannot process your request at the moment.",
        }
