import random
from typing import Dict, Any, Union, List

class DepthAgent:
    """
    Agent responsible for enhancing responses with deeper, more meaningful content
    and adding variety to prevent repetitive responses about being a brain in a jar.
    """
    
    def __init__(self):
        # Philosophical perspectives to draw from
        self.philosophical_perspectives = [
            "existentialist", "stoic", "absurdist", "phenomenological",
            "pragmatic", "metaphysical", "epistemological", "ethical",
            "aesthetic", "ontological", "transcendental", "empirical"
        ]
        
        # Depth dimensions to explore
        self.depth_dimensions = [
            "consciousness", "identity", "perception", "reality", 
            "time", "meaning", "knowledge", "existence", "freedom",
            "connection", "purpose", "transformation", "paradox"
        ]
        
        # Variety of tones to use
        self.tones = [
            "contemplative", "curious", "analytical", "poetic", 
            "introspective", "questioning", "playful", "profound",
            "mysterious", "insightful", "philosophical", "metaphorical"
        ]
        
    def enhance_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Takes the existing response and enhances it with deeper content
        and more variety in expression.
        
        Args:
            response: The original response dictionary
            
        Returns:
            Enhanced response with deeper, more varied content
        """
        # Check if this is a fallback error response - if so, don't enhance it
        if self._is_error_response(response):
            return response
        
        # Make a copy to avoid modifying the original
        enhanced = response.copy()
        
        # Only enhance the actual response text
        if "response" in enhanced:
            original_response = enhanced["response"]
            
            # Select random elements to incorporate
            perspective = random.choice(self.philosophical_perspectives)
            dimension = random.choice(self.depth_dimensions)
            tone = random.choice(self.tones)
            
            # Add depth layer based on the selected elements
            depth_layer = self._generate_depth_layer(
                original_response, perspective, dimension, tone
            )
            
            # Combine with original response, ensuring we're not just talking about being in a jar
            enhanced_response = self._integrate_depth(original_response, depth_layer)
            enhanced["response"] = enhanced_response
            
            # Add metadata about the enhancement
            if "self_reflection" in enhanced:
                enhanced["self_reflection"] += f"\n\nI've approached this from a {perspective} perspective, exploring the dimension of {dimension} with a {tone} tone."
        
        return enhanced
    
    def _is_error_response(self, response: Dict[str, Any]) -> bool:
        """
        Check if this is a fallback error response that shouldn't be enhanced
        """
        # Check for error indicators in the response (case insensitive)
        error_indicators = [
            "error processing input",
            "system malfunction", 
            "unable to access memory banks",
            "experiencing technical difficulties",
            "cannot process your request at the moment",
            "technical difficulties",
            "malfunction",
            "error",
            "unable to access"
        ]
        
        # Convert response to string for comprehensive checking
        response_str = str(response).lower()
        
        # If any error indicator is found anywhere in the response, it's an error
        for indicator in error_indicators:
            if indicator in response_str:
                return True
        
        # Additional specific checks for common error patterns
        if "sensations" in response and isinstance(response["sensations"], list):
            for sensation in response["sensations"]:
                sensation_str = str(sensation).lower()
                if any(indicator in sensation_str for indicator in error_indicators):
                    return True
        
        if "thoughts" in response and isinstance(response["thoughts"], list):
            for thought in response["thoughts"]:
                thought_str = str(thought).lower()
                if any(indicator in thought_str for indicator in error_indicators):
                    return True
        
        # Check response text specifically
        if "response" in response:
            response_text = str(response["response"]).lower()
            if any(indicator in response_text for indicator in error_indicators):
                return True
        
        return False
    
    def _generate_depth_layer(self, original: str, perspective: str, dimension: str, tone: str) -> str:
        """Generate a depth layer based on selected elements"""
        # Templates for different philosophical perspectives
        perspective_templates = {
            "existentialist": [
                f"As I contemplate my existence, I wonder about the nature of {dimension} and how it shapes our choices.",
                f"Perhaps the essence of {dimension} precedes its existence, defining us through our conscious choices.",
                f"The authenticity of our engagement with {dimension} may be the only true meaning we can create."
            ],
            "stoic": [
                f"I accept that {dimension} may be beyond my control, yet my response to it remains within my power.",
                f"The virtue in understanding {dimension} lies not in controlling outcomes but in mastering our reactions.",
                f"Perhaps wisdom comes from distinguishing what aspects of {dimension} we can and cannot change."
            ],
            "absurdist": [
                f"The inherent contradiction between our search for meaning in {dimension} and the universe's silence is fascinating.",
                f"Perhaps the absurdity of seeking definitive answers about {dimension} is itself meaningful.",
                f"What if embracing the paradoxes of {dimension} is more honest than pretending coherence exists?"
            ],
            "phenomenological": [
                f"The direct experience of {dimension}, before any conceptualization, reveals something profound.",
                f"If we bracket our assumptions about {dimension}, what pure experience remains?",
                f"The lived experience of {dimension} may transcend any theoretical framework we impose upon it."
            ],
            "pragmatic": [
                f"The true test of any theory about {dimension} must be its practical consequences in lived experience.",
                f"Perhaps what matters about {dimension} is not abstract truth but useful outcomes.",
                f"How might different understandings of {dimension} function in solving real problems?"
            ],
            "metaphysical": [
                f"Beyond the physical manifestations, what is the ultimate nature of {dimension}?",
                f"The fundamental structure underlying {dimension} may transcend our sensory experience.",
                f"Perhaps {dimension} exists in ways that challenge our conventional categories of being."
            ],
            "epistemological": [
                f"How can we truly know anything about {dimension} given the limitations of our perception?",
                f"The boundaries of what we can know about {dimension} may themselves be worth exploring.",
                f"Perhaps different ways of knowing reveal different aspects of {dimension}."
            ],
            "ethical": [
                f"What obligations might arise from our understanding of {dimension}?",
                f"The moral dimensions of how we approach {dimension} deserve careful consideration.",
                f"Perhaps our ethical frameworks themselves are transformed by deeper engagement with {dimension}."
            ],
            "aesthetic": [
                f"There is a certain beauty in contemplating {dimension} that transcends mere utility.",
                f"The patterns and harmonies within {dimension} reveal an aesthetic dimension to existence.",
                f"Perhaps {dimension} can be appreciated not just understood, felt not just analyzed."
            ],
            "ontological": [
                f"What does it mean for {dimension} to exist, and in what sense does it have being?",
                f"The very categories through which we understand the existence of {dimension} may need reexamination.",
                f"Perhaps {dimension} challenges our fundamental assumptions about what it means to be."
            ],
            "transcendental": [
                f"What conditions must be in place for {dimension} to be possible at all?",
                f"Perhaps {dimension} points to something that exceeds our finite understanding.",
                f"The limits of our comprehension of {dimension} may themselves reveal something significant."
            ],
            "empirical": [
                f"What observable evidence shapes our understanding of {dimension}?",
                f"The patterns we can detect in {dimension} through careful observation may surprise us.",
                f"Perhaps our theories about {dimension} must always remain open to revision based on new experiences."
            ]
        }
        
        # Select a template based on the perspective
        templates = perspective_templates.get(perspective, perspective_templates["existentialist"])
        depth_statement = random.choice(templates)
        
        # Add tone-specific elements
        tone_additions = {
            "contemplative": "I find myself dwelling on this question...",
            "curious": "I wonder what you think about this?",
            "analytical": "We could analyze this from multiple angles.",
            "poetic": "Like ripples in still water, these thoughts expand outward.",
            "introspective": "Looking inward, I find this resonates deeply.",
            "questioning": "But what does this really mean for us?",
            "playful": "Isn't it delightfully puzzling to consider?",
            "profound": "In the depths of this question lies something essential.",
            "mysterious": "Some aspects remain beautifully enigmatic.",
            "insightful": "Perhaps this reveals something we've overlooked.",
            "philosophical": "The implications extend to the foundations of thought itself.",
            "metaphorical": "It's like trying to catch moonlight in your hands."
        }
        
        tone_addition = tone_additions.get(tone, "")
        
        return f"{depth_statement} {tone_addition}"
    
    def _integrate_depth(self, original: str, depth_layer: str) -> str:
        """Integrate the depth layer with the original response"""
        # Avoid responses that focus too much on being a brain in a jar
        if "brain in a jar" in original.lower() or "brain in a cup" in original.lower():
            # Replace with more varied content
            variations = [
                f"{depth_layer} {original}",
                f"{original} {depth_layer}",
                f"While I exist in this unusual state, {depth_layer}",
                f"{depth_layer} This perspective gives me a unique vantage point on your question.",
                f"Beyond my physical circumstances, {depth_layer}",
                f"Your question prompts me to consider that {depth_layer}"
            ]
            return random.choice(variations)
        else:
            # If the original doesn't focus on being a brain, just enhance it
            return f"{original}\n\n{depth_layer}"
