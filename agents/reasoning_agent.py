import json
import logging
from langchain.output_parsers import StructuredOutputParser

logger = logging.getLogger(__name__)

class ReasoningAgent:
    def __init__(self, parser):
        self.parser = parser

    def analyze_input(self, llm_response, context):
        """Parse and validate the LLM response"""
        try:
            
            # Try to parse as JSON first
            if isinstance(llm_response, str):
                try:
                    parsed = json.loads(llm_response)
                    if all(k in parsed for k in ["sensations", "thoughts", "memories", "self_reflection"]):
                        return parsed
                except json.JSONDecodeError as e:
                    logger.debug(f"JSON parse error: {e}")
                    
            # If JSON parsing failed or response wasn't valid, try LangChain parser
            try:
                parsed = self.parser.parse(llm_response)
                if all(k in parsed for k in ["sensations", "thoughts", "memories", "self_reflection"]):
                    return parsed
            except Exception as e:
                logger.debug(f"LangChain parser error: {e}")
                
            # If both parsing attempts failed, return error response
            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable",
                "response": "I apologize, but I'm having trouble processing that right now."
            }
        except Exception as e:
            print(f"⚠️ Parser error: {e}")
            return {
                "sensations": ["Error processing response"],
                "thoughts": ["Unable to parse thoughts"],
                "memories": "Memory retrieval failed",
                "self_reflection": "Self-reflection unavailable"
            }
