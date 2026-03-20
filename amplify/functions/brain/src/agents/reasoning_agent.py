import json
import logging
import re

logger = logging.getLogger(__name__)


class ReasoningAgent:
    def __init__(self, parser):
        self.parser = parser
        self.required_keys = (
            "sensations",
            "thoughts",
            "memories",
            "self_reflection",
            "response",
        )

    @staticmethod
    def _strip_markdown_fences(text: str) -> str:
        stripped = (text or "").strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
            stripped = re.sub(r"\s*```$", "", stripped)
        return stripped.strip()

    @staticmethod
    def _coerce_string_list(value):
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            text = value.strip()
            return [text] if text else []
        text = str(value).strip()
        return [text] if text else []

    @staticmethod
    def _empty_response():
        return {
            "sensations": [],
            "thoughts": [],
            "memories": "",
            "self_reflection": "",
            "response": "",
        }

    def _normalize_structured_payload(self, payload):
        if not isinstance(payload, dict):
            return None

        candidate = payload.copy()
        if "self_reflection" not in candidate and "selfReflection" in candidate:
            candidate["self_reflection"] = candidate.get("selfReflection")

        if not any(key in candidate for key in self.required_keys):
            return None

        normalized = self._empty_response()
        normalized["sensations"] = self._coerce_string_list(candidate.get("sensations"))
        normalized["thoughts"] = self._coerce_string_list(candidate.get("thoughts"))
        normalized["memories"] = str(candidate.get("memories") or "").strip()
        normalized["self_reflection"] = str(candidate.get("self_reflection") or "").strip()

        response_value = candidate.get("response", "")
        if isinstance(response_value, str):
            normalized["response"] = self._clean_response_text(response_value)
        else:
            normalized["response"] = self._clean_response_text(str(response_value))

        if not normalized["response"]:
            return None
        return normalized

    def _parse_json_text(self, text):
        if not isinstance(text, str) or not text.strip():
            return None
        cleaned = self._strip_markdown_fences(text)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
        return self._normalize_structured_payload(parsed)

    def _extract_structured_payload_from_mixed_text(self, text):
        if not isinstance(text, str) or not text.strip():
            return None

        cleaned = self._strip_markdown_fences(text)
        direct = self._parse_json_text(cleaned)
        if direct:
            return direct

        decoder = json.JSONDecoder()
        for index, char in enumerate(cleaned):
            if char != "{":
                continue
            try:
                parsed, _ = decoder.raw_decode(cleaned[index:])
            except json.JSONDecodeError:
                continue
            normalized = self._normalize_structured_payload(parsed)
            if normalized:
                return normalized
        return None

    def _clean_response_text(self, text: str) -> str:
        cleaned = self._strip_markdown_fences(text)

        nested = self._extract_structured_payload_from_mixed_text(cleaned)
        if nested:
            return nested.get("response", "")

        cleaned = re.sub(
            r"(?is)\A.*?\bhere(?:'s| is)\b.*?\bjson\b.*?:\s*",
            "",
            cleaned,
            count=1,
        ).strip()
        cleaned = re.sub(
            r"(?is)\A.*?\brequested json format\b[:\s]*",
            "",
            cleaned,
            count=1,
        ).strip()

        leak_markers = ("\"sensations\"", "\"thoughts\"", "\"self_reflection\"", "```json")
        if any(marker in cleaned.lower() for marker in leak_markers):
            first_paragraph = cleaned.split("\n\n", 1)[0].strip()
            if first_paragraph and "{" not in first_paragraph and "}" not in first_paragraph:
                cleaned = first_paragraph
            else:
                cleaned = ""

        return cleaned.strip().strip("\"'` ")

    def analyze_input(self, llm_response, context):
        """Parse and validate the LLM response"""
        try:
            if isinstance(llm_response, dict):
                nested = self._extract_structured_payload_from_mixed_text(
                    str(llm_response.get("response", ""))
                )
                if nested:
                    return nested
                normalized = self._normalize_structured_payload(llm_response)
                if normalized:
                    return normalized

            if isinstance(llm_response, str):
                parsed = self._parse_json_text(llm_response)
                if parsed:
                    return parsed
                nested = self._extract_structured_payload_from_mixed_text(llm_response)
                if nested:
                    return nested
                cleaned = self._clean_response_text(llm_response)
                if cleaned:
                    fallback = self._empty_response()
                    fallback["response"] = cleaned
                    return fallback

            try:
                parsed = self.parser.parse(llm_response)
                normalized = self._normalize_structured_payload(parsed)
                if normalized:
                    return normalized
            except Exception as error:
                logger.debug("Parser error: %s", error)

            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable",
                "response": "I apologize, but I'm having trouble processing that right now.",
            }
        except Exception as error:
            logger.warning("ReasoningAgent failed to parse response: %s", error)
            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable",
                "response": "I apologize, but I'm having trouble processing that right now.",
            }
