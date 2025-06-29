import json
import logging

logger = logging.getLogger(__name__)


class LanguageAgent:
    def __init__(self, llm):
        self.llm = llm
        self.memory = []

    def generate_response(self, formatted_prompt):
        """Generate response using the LLM"""
        try:
            # ChatBedrock expects a specific message format
            # Try different message formats that ChatBedrock might accept
            
            # Format 1: List of message dictionaries
            try:
                messages = [{"role": "user", "content": formatted_prompt}]
                response = self.llm.invoke(messages)
                logger.info("Format 1 (dict messages) worked")
            except Exception as e1:
                logger.warning(f"Format 1 failed: {e1}")
                
                # Format 2: LangChain HumanMessage
                try:
                    from langchain_core.messages import HumanMessage
                    messages = [HumanMessage(content=formatted_prompt)]
                    response = self.llm.invoke(messages)
                    logger.info("Format 2 (HumanMessage) worked")
                except Exception as e2:
                    logger.warning(f"Format 2 failed: {e2}")
                    
                    # Format 3: Direct string (original)
                    try:
                        response = self.llm.invoke(formatted_prompt)
                        logger.info("Format 3 (direct string) worked")
                    except Exception as e3:
                        logger.warning(f"Format 3 failed: {e3}")
                        
                        # Format 4: Wrapped in messages key
                        try:
                            payload = {"messages": [{"role": "user", "content": formatted_prompt}]}
                            response = self.llm.invoke(payload)
                            logger.info("Format 4 (wrapped messages) worked")
                        except Exception as e4:
                            logger.error(f"All formats failed. Last error: {e4}")
                            raise e4

            # Extract content from response
            if hasattr(response, "content"):
                content = response.content
            elif hasattr(response, "text"):
                content = response.text
            elif isinstance(response, (dict, list)):
                content = json.dumps(response)
            else:
                content = str(response)

            # Clean up any extra escaping
            content = content.strip()
            return content
            
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return json.dumps({
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties",
                "response": "I'm experiencing technical difficulties and cannot process your request at the moment."
            })
