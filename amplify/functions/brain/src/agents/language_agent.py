import logging
from typing import Any, Dict, Optional

from core.agentcore_client import AgentCoreClient

logger = logging.getLogger(__name__)


class LanguageAgent:
    def __init__(self, agent_client: AgentCoreClient, persona_config: Dict[str, Any]):
        self.agent_client = agent_client
        self.persona_config = persona_config
        self.memory = []

    def generate_response(
        self,
        *,
        variables: Dict[str, Any],
        session_id: str,
        template_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Send structured variables to AgentCore runtime for prompt assembly.
        
        Args:
            variables: Dictionary of template variables (user_input, context, etc.)
            session_id: Conversation/session identifier
            template_name: AgentCore template name (optional, derived from mode if not provided)
            metadata: Additional metadata for tracing and logging
        
        Returns:
            Structured response from AgentCore/Bedrock
        """
        metadata = metadata or {}
        
        # Determine template based on personality mode if not explicitly provided
        if not template_name:
            personality_mode = metadata.get("personality_mode", "default")
            template_name = self._get_template_name(personality_mode)
        
        # Build payload with structured variables instead of formatted prompt
        payload = {
            "template": template_name,
            "variables": variables,
            "persona": {
                "name": self.persona_config.get("name", "Brain"),
                "mode": metadata.get("personality_mode"),
                "temperature": self.persona_config.get("temperature", 1.0),
                "top_p": self.persona_config.get("top_p", 1.0),
            },
            "metadata": {
                "conversation_id": metadata.get("conversation_id"),
                "message_id": metadata.get("message_id"),
                "owner": metadata.get("owner"),
                "trace_id": metadata.get("trace_id"),
            },
        }
        
        logger.info(
            "Sending structured payload to AgentCore",
            extra={
                "template": template_name,
                "variable_keys": list(variables.keys()),
                "personality_mode": metadata.get("personality_mode"),
                "full_payload": payload  # Log full payload for debugging
            }
        )

        try:
            logger.info(f"Invoking AgentCore with session_id: {session_id}")
            response = self.agent_client.invoke(
                session_id=session_id,
                payload=payload,
                trace_metadata=metadata.get("trace_id"),
            )
            logger.info(f"AgentCore response received: {response}")
            return response or self._fallback_response()
        except Exception as error:
            logger.error(
                "AgentCore invocation failed",
                exc_info=error,
                extra={
                    "error_type": type(error).__name__,
                    "error_message": str(error),
                    "session_id": session_id,
                    "template": template_name
                }
            )
            return self._fallback_response()
    
    def _get_template_name(self, personality_mode: str) -> str:
        """Map personality mode to AgentCore template name."""
        import os
        
        # Read template names from environment variables (set in backend.ts)
        default_template = os.getenv("AGENTCORE_DEFAULT_TEMPLATE", "brain_default_persona")
        game_master_template = os.getenv("AGENTCORE_GAME_MASTER_TEMPLATE", "brain_game_master")
        
        template_mapping = {
            "default": default_template,
            "game_master": game_master_template,
            # Add more modes as needed
        }
        
        template = template_mapping.get(personality_mode, default_template)
        logger.debug(f"Selected template '{template}' for mode '{personality_mode}'")
        return template

    @staticmethod
    def _fallback_response() -> Dict[str, Any]:
        return {
            "sensations": ["Error processing input"],
            "thoughts": ["System malfunction"],
            "memories": "Unable to access memory banks",
            "self_reflection": "Experiencing technical difficulties",
            "response": "I'm experiencing technical difficulties and cannot process your request at the moment.",
        }
