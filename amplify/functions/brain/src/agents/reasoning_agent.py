import json
import logging
import re

logger = logging.getLogger(__name__)


class ReasoningAgent:
    def __init__(self, parser):
        self.parser = parser
        self.required_keys = [
            "sensations",
            "thoughts",
            "memories",
            "self_reflection",
            "response",
        ]

    def _normalize_payload(self, payload):
        if not isinstance(payload, dict):
            return None
        normalized = payload.copy()
        if "self_reflection" not in normalized and "selfReflection" in normalized:
            normalized["self_reflection"] = normalized.get("selfReflection")
        if all(k in normalized for k in self.required_keys):
            return normalized
        return None

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        stripped = (text or "").strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
            stripped = re.sub(r"\s*```$", "", stripped)
        return stripped.strip()

    def _parse_json_text(self, text):
        if not isinstance(text, str) or not text.strip():
            return None
        cleaned = self._strip_markdown_fences(text)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
        return self._normalize_payload(parsed)

    def analyze_input(self, llm_response, context):
        """Parse and validate the LLM response"""
        try:
            if isinstance(llm_response, dict):
                normalized = self._normalize_payload(llm_response)
                if normalized:
                    return normalized
                nested = self._parse_json_text(llm_response.get("response"))
                if nested:
                    return nested

            # Try to parse as JSON first
            if isinstance(llm_response, str):
                parsed = self._parse_json_text(llm_response)
                if parsed:
                    return parsed

            # If JSON parsing failed or response wasn't valid, try LangChain parser
            try:
                parsed = self.parser.parse(llm_response)
                normalized = self._normalize_payload(parsed)
                if normalized:
                    return normalized
            except Exception as e:
                logger.debug(f"LangChain parser error: {e}")

            # If both parsing attempts failed, return error response
            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable",
                "response": "I apologize, but I'm having trouble processing that right now.",
            }
        except Exception as e:
            print(f"⚠️ Parser error: {e}")
            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable",
                "response": "I apologize, but I'm having trouble processing that right now.",
            }
