"""
AgentCore Runtime Entrypoint for Brain In Cup

This module implements the AgentCore runtime contract, exposing an HTTP server
that processes user prompts and returns structured JSON responses.

AWS AgentCore Runtime documentation:
https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-getting-started.html
"""
import json
import logging
import os
from typing import Any, Dict

import boto3
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from opentelemetry import baggage, context as otel_context

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI()


def _set_session_baggage(session_id: str) -> None:
    """Set OTEL baggage key 'session.id' for session correlation in traces."""
    ctx = baggage.set_baggage("session.id", session_id)
    otel_context.attach(ctx)


class BrainAgent:
    """
    Brain In Cup agent implementation.
    
    This agent receives prompts with persona/context metadata and returns
    JSON-structured responses matching the expected schema.
    """
    
    def __init__(self):
        self.model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
        self.bedrock_client = boto3.client('bedrock-runtime', region_name=os.getenv("AWS_REGION", "us-east-1"))
        logger.info(f"BrainAgent initialized with model: {self.model_id}")
    
    def process(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process an incoming AgentCore runtime event.
        
        Expected event structure:
        {
            "prompt": str,
            "persona": {
                "name": str,
                "mode": str,
                "temperature": float,
                "top_p": float
            },
            "context": str,
            "message": {
                "id": str,
                "owner": str
            }
        }
        
        Returns:
        {
            "sensations": [str, ...],
            "thoughts": [str, ...],
            "memories": str,
            "self_reflection": str,
            "response": str,
            "quest_title": str (optional),
            "quest_setting": str (optional),
            "quest_tone": str (optional),
            "quest_difficulty": str (optional)
        }
        """
        try:
            prompt = event.get("prompt", "")
            persona = event.get("persona", {})
            context = event.get("context", "")
            
            # Set OTEL session baggage for trace correlation (Requirement 4.5, 5.1)
            if context:
                _set_session_baggage(context)
            
            logger.info(
                "Processing request",
                extra={
                    "persona_name": persona.get("name"),
                    "prompt_length": len(prompt),
                    "has_context": bool(context),
                },
            )
            
            # Invoke Bedrock model
            temperature = float(persona.get("temperature", 1.0))
            top_p = float(persona.get("top_p", 1.0))
            
            bedrock_request = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "system": (
                    "You are the Game Master for Brain in Cup, an immersive text-based RPG. "
                    "Always respond with ONLY a valid JSON object — no markdown, no code fences, no extra text. "
                    "Required fields: sensations (array of strings), thoughts (array of strings), "
                    "memories (string), self_reflection (string), response (string), "
                    "xp_award (integer), hp_change (integer), "
                    "quest_step_advance (string or null), quest_complete (string or null), "
                    "quest_fail (string or null), world_flags_set (object), "
                    "dice_roll_request (object or null), tension_level (integer 1-10), "
                    "area_transition (string or null), "
                    "current_location (string — REQUIRED, always set to the current scene location name, never null or empty), "
                    "item_grant (object or null). "
                    "The current_location field MUST always contain the name of the place where the scene is happening "
                    "(e.g. 'The Shrouded Vale', 'The Darkwood', 'The Ruined Keep'). Never omit it."
                ),
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
                "top_p": top_p,
            }
            
            logger.debug(f"Invoking model {self.model_id} with temperature={temperature}, top_p={top_p}")
            
            response = self.bedrock_client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(bedrock_request)
            )
            
            model_response = json.loads(response['body'].read())
            logger.debug(f"Model response: {json.dumps(model_response, default=str)}")
            
            # Extract the text content from Claude's response
            content = model_response.get("content", [])
            if content and isinstance(content, list) and len(content) > 0:
                raw_text = content[0].get("text", "")
            else:
                raw_text = ""
            
            # Try to parse as JSON (the prompt should instruct the model to return JSON)
            try:
                response_payload = json.loads(raw_text)
                
                # Validate required fields
                required_fields = ["sensations", "thoughts", "memories", "self_reflection", "response"]
                if all(field in response_payload for field in required_fields):
                    logger.info("Response generated successfully with valid JSON")
                    return response_payload
                else:
                    logger.warning(f"Model response missing required fields. Got: {list(response_payload.keys())}")
                    # Fall through to fallback
            except json.JSONDecodeError as e:
                logger.warning(f"Model did not return valid JSON: {e}")
                # Fall through to fallback
            
            # Fallback: wrap raw text in expected structure
            logger.info("Using fallback response structure")
            fallback_response = {
                "sensations": ["Neural pathways activating"],
                "thoughts": ["Analyzing the question"],
                "memories": f"Context: {context[:100] if context else 'No prior context'}",
                "self_reflection": "Working to understand and respond meaningfully",
                "response": raw_text if raw_text else "I processed your message but encountered difficulty generating a structured response.",
                "xp_award": 0,
                "hp_change": 0,
                "quest_step_advance": None,
                "quest_complete": None,
                "quest_fail": None,
                "world_flags_set": {},
                "dice_roll_request": None,
                "tension_level": 5,
                "area_transition": None,
                "current_location": "",
                "item_grant": None,
            }
            return fallback_response
            
        except Exception as error:
            logger.error("Failed to process event", exc_info=error)
            return {
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties",
                "response": "I'm experiencing technical difficulties and cannot process your request at the moment.",
            }


# Global agent instance
agent = BrainAgent()


@app.post("/invocations")
async def invocations(request: Request):
    """
    AgentCore runtime invocations endpoint.
    
    This is the main entrypoint called by the AgentCore runtime.
    """
    try:
        payload = await request.json()
        logger.debug(f"Received payload: {json.dumps(payload, default=str)}")
        
        response = agent.process(payload)
        logger.debug(f"Returning response: {json.dumps(response, default=str)}")
        
        return JSONResponse(content=response)
    except Exception as error:
        logger.error("Invocation handler failed", exc_info=error)
        return JSONResponse(
            content={
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties",
                "response": "I'm experiencing technical difficulties and cannot process your request at the moment.",
            },
            status_code=500
        )


@app.get("/ping")
def ping():
    """Health check endpoint required by AgentCore."""
    return {"status": "healthy"}


if __name__ == "__main__":
    # Run the FastAPI server
    port = int(os.getenv("PORT", "8080"))
    logger.info(f"Starting AgentCore runtime server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
