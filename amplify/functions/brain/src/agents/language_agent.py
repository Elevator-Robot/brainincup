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
                logger.info("Successfully used dict messages format")
                return self._extract_content(response)
            except Exception as e1:
                logger.debug(f"Dict messages format failed: {e1}")
                
                # Format 2: LangChain HumanMessage
                try:
                    from langchain_core.messages import HumanMessage
                    messages = [HumanMessage(content=formatted_prompt)]
                    response = self.llm.invoke(messages)
                    logger.info("Successfully used HumanMessage format")
                    return self._extract_content(response)
                except Exception as e2:
                    logger.debug(f"HumanMessage format failed: {e2}")
                    
                    # Format 3: Direct string (original)
                    try:
                        response = self.llm.invoke(formatted_prompt)
                        logger.info("Successfully used direct string format")
                        return self._extract_content(response)
                    except Exception as e3:
                        logger.debug(f"Direct string format failed: {e3}")
                        
                        # Format 4: Wrapped in messages key
                        try:
                            payload = {"messages": [{"role": "user", "content": formatted_prompt}]}
                            response = self.llm.invoke(payload)
                            logger.info("Successfully used wrapped messages format")
                            return self._extract_content(response)
                        except Exception as e4:
                            logger.error(f"All message formats failed. Last error: {e4}")
                            raise e4

        except Exception as e:
            logger.error(f"LLM error: {e}")
            return json.dumps({
                "sensations": ["Error processing input"],
                "thoughts": ["System malfunction"],
                "memories": "Unable to access memory banks",
                "self_reflection": "Experiencing technical difficulties",
                "response": "I'm experiencing technical difficulties and cannot process your request at the moment."
            })

    def _extract_content(self, response):
        """Extract content from LLM response"""
        try:
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
            logger.error(f"Error extracting content from response: {e}")
            raise e
