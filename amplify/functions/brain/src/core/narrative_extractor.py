"""
Narrative Extractor Module

Extracts story structure from AI responses and manages narrative consistency.
"""

import re
import logging
from typing import Optional, Dict, List, Tuple
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class StoryAct(Enum):
    """Story act progression stages"""
    EXPOSITION = "EXPOSITION"
    RISING_ACTION = "RISING_ACTION"
    CLIMAX = "CLIMAX"
    FALLING_ACTION = "FALLING_ACTION"
    RESOLUTION = "RESOLUTION"


class StoryBeat(Enum):
    """Types of story beats for tension calculation"""
    DISCOVERY = "DISCOVERY"
    CONFLICT = "CONFLICT"
    RESOLUTION = "RESOLUTION"
    BETRAYAL = "BETRAYAL"
    SACRIFICE = "SACRIFICE"
    CALM_MOMENT = "CALM_MOMENT"
    SCENE_CHANGE = "SCENE_CHANGE"


# Story beat detection patterns
STORY_BEAT_PATTERNS = {
    StoryBeat.DISCOVERY: ['discover', 'found', 'revealed', 'learned', 'noticed', 'realized'],
    StoryBeat.CONFLICT: ['fight', 'battle', 'confront', 'attacked', 'challenged', 'threatened'],
    StoryBeat.RESOLUTION: ['defeated', 'solved', 'completed', 'succeeded', 'won', 'finished'],
    StoryBeat.BETRAYAL: ['betrayed', 'deceived', 'trapped', 'lied', 'tricked'],
    StoryBeat.SACRIFICE: ['sacrificed', 'gave up', 'lost', 'died', 'destroyed'],
}

# Tension adjustments for each story beat
TENSION_ADJUSTMENTS = {
    StoryBeat.CONFLICT: +2,
    StoryBeat.DISCOVERY: +1,
    StoryBeat.BETRAYAL: +2,
    StoryBeat.SACRIFICE: +1,
    StoryBeat.RESOLUTION: -2,
    StoryBeat.CALM_MOMENT: -1,
    StoryBeat.SCENE_CHANGE: 0,
}


class NarrativeExtractor:
    """Extract and manage story structure from AI responses"""
    
    def __init__(self):
        # Location detection patterns (order matters - most specific first)
        self.location_patterns = [
            # AI narration of player's location ("You are in...", "You find yourself in...")
            r"(?:You (?:are|find yourself|stand) (?:in|at|within|inside)) (?:the )?([A-Z][a-zA-Z\s',.-]+?)(?:\.|,|$)",
            
            # Formal fantasy locations with type suffixes
            r"(?:You (?:arrive at|enter|find yourself in|step into|approach|reach)|The scene shifts to) (?:the )?([A-Z][a-zA-Z\s'-]+(?:Grove|Forest|Tavern|Castle|Temple|Village|City|Tower|Cave|Dungeon|Manor|Keep|Hall|Inn|Market|Square|Garden|Ruins|Mountain|Valley|Lake|River|Bridge|Gate|Chamber|Sanctum|Lair|Den|Crypt|Tomb|Shrine))",
            r"(?:At|In|Within|Inside) (?:the )?([A-Z][a-zA-Z\s'-]+(?:Grove|Forest|Tavern|Castle|Temple|Village|City|Tower|Cave|Dungeon|Manor|Keep|Hall|Inn|Market|Square|Garden|Ruins|Mountain|Valley|Lake|River|Bridge|Gate|Chamber|Sanctum|Lair|Den|Crypt|Tomb|Shrine))",
            r"The ([A-Z][a-zA-Z\s'-]+(?:Grove|Forest|Tavern|Castle|Temple|Village|City|Tower|Cave|Dungeon|Manor|Keep|Hall|Inn)) (?:stretches|looms|stands|appears)",
            
            # Generic location mentions (fallback)
            r"(?:arrive (?:at|in)|enter|travel to|head to|move to|walk to|go to) (?:the )?([A-Z][a-zA-Z\s',.-]+?)(?:\.|,|$)",
        ]
        
        # Scene descriptor patterns (optional, more detailed)
        self.scene_patterns = [
            r"(?:You find yourself |You're |You are )([a-z][^.!?]*?)(?:\.|,|\band\b)",
            r"The scene (?:shifts|opens) (?:to|with) ([^.!?]+)",
        ]
    
    def extract_location(
        self, 
        response: str, 
        current_location: str
    ) -> Dict[str, any]:
        """
        Extract location changes from AI response.
        
        Returns:
            {
                'location': str,           # Extracted location name
                'scene': str,              # Scene description
                'is_transition': bool,     # True if location changed
                'confidence': float,       # 0.0-1.0 confidence score
                'raw_match': str           # Raw text that matched
            }
        """
        location = current_location
        scene = ""
        is_transition = False
        confidence = 0.0
        raw_match = ""
        
        # Try to extract location
        for pattern in self.location_patterns:
            match = re.search(pattern, response, re.IGNORECASE)
            if match:
                extracted_location = match.group(1).strip()
                
                # Check if it's actually a new location
                if extracted_location.lower() != current_location.lower():
                    location = extracted_location
                    is_transition = True
                    confidence = 0.9  # High confidence from explicit pattern
                    raw_match = match.group(0)
                    logger.info(f"Location transition detected: {current_location} → {location}")
                    break
                else:
                    # Same location mentioned, not a transition
                    confidence = 0.8
                    raw_match = match.group(0)
        
        # Try to extract scene description
        for pattern in self.scene_patterns:
            match = re.search(pattern, response)
            if match:
                scene = match.group(1).strip()
                break
        
        return {
            'location': location,
            'scene': scene,
            'is_transition': is_transition,
            'confidence': confidence,
            'raw_match': raw_match,
        }
    
    def validate_location_transition(
        self,
        from_location: str,
        to_location: str,
        visited_locations: List[Dict]
    ) -> Tuple[bool, str]:
        """
        Validate that a location change makes logical sense.
        
        Returns:
            (is_valid, reason)
        """
        # If first location, always valid
        if from_location == 'Unknown Location':
            return True, "Initial location"
        
        # Check if we have connectivity data
        from_loc_data = next(
            (loc for loc in visited_locations if loc['name'] == from_location),
            None
        )
        
        if not from_loc_data:
            # Haven't visited from_location yet, allow it
            return True, "New location, no connectivity data"
        
        # Check if locations are connected
        connected_to = from_loc_data.get('connectedTo', [])
        
        if to_location in connected_to:
            return True, "Connected location"
        
        # Check if this is a known location we've visited before
        # (can fast-travel to visited locations)
        to_loc_data = next(
            (loc for loc in visited_locations if loc['name'] == to_location),
            None
        )
        
        if to_loc_data:
            return True, "Previously visited location (fast travel)"
        
        # For now, allow new locations (GM might be introducing new area)
        # In production, you might want to be stricter
        logger.warning(
            f"Location transition {from_location} → {to_location} "
            f"not in connectivity graph, but allowing"
        )
        return True, "New area discovered"
    
    def detect_story_beat(self, text: str) -> Optional[StoryBeat]:
        """
        Identify significant narrative moments in the text.
        
        Returns:
            StoryBeat enum value or None
        """
        text_lower = text.lower()
        
        for beat_type, keywords in STORY_BEAT_PATTERNS.items():
            if any(keyword in text_lower for keyword in keywords):
                return beat_type
        
        return None
    
    def calculate_tension_change(
        self,
        current_tension: int,
        story_beat: Optional[StoryBeat],
        turns_since_conflict: int
    ) -> int:
        """
        Calculate new tension level based on story events.
        
        Args:
            current_tension: Current tension (1-10)
            story_beat: Detected story beat type
            turns_since_conflict: Number of turns since last conflict
        
        Returns:
            New tension value (1-10)
        """
        adjustment = 0
        
        if story_beat:
            adjustment = TENSION_ADJUSTMENTS.get(story_beat, 0)
        
        # Gradually build tension if no conflict
        if turns_since_conflict > 5:
            adjustment += 1
            logger.debug(f"Building tension ({turns_since_conflict} turns without conflict)")
        
        new_tension = current_tension + adjustment
        
        # Clamp to valid range
        new_tension = max(1, min(10, new_tension))
        
        if adjustment != 0:
            logger.info(f"Tension: {current_tension} → {new_tension} (beat: {story_beat})")
        
        return new_tension
    
    def should_advance_act(
        self,
        current_act: StoryAct,
        tension_level: int,
        chapter_count: int,
        timeline_length: int
    ) -> Tuple[bool, Optional[StoryAct], str]:
        """
        Determine if story should progress to next act.
        
        Returns:
            (should_advance, new_act, reason)
        """
        # Act progression logic based on story structure
        
        if current_act == StoryAct.EXPOSITION:
            # Move to rising action after introduction (3-5 turns) and tension building
            if timeline_length >= 3 and tension_level >= 5:
                return True, StoryAct.RISING_ACTION, "Conflict introduced, moving to rising action"
        
        elif current_act == StoryAct.RISING_ACTION:
            # Move to climax when tension is very high (8+) and enough story has happened
            if tension_level >= 8 and timeline_length >= 10:
                return True, StoryAct.CLIMAX, "Tension peaked, entering climax"
        
        elif current_act == StoryAct.CLIMAX:
            # Move to falling action when tension drops after peak
            if tension_level <= 5:
                return True, StoryAct.FALLING_ACTION, "Climax resolved, entering falling action"
        
        elif current_act == StoryAct.FALLING_ACTION:
            # Move to resolution when tension is low and story wrapping up
            if tension_level <= 3 and timeline_length >= 15:
                return True, StoryAct.RESOLUTION, "Story winding down, entering resolution"
        
        return False, None, ""
    
    def should_advance_chapter(
        self,
        chapter_count: int,
        turns_in_chapter: int,
        tension_level: int,
        last_story_beat: Optional[StoryBeat]
    ) -> Tuple[bool, str]:
        """
        Determine if story should move to next chapter.
        
        Returns:
            (should_advance, reason)
        """
        # Natural chapter breaks
        if turns_in_chapter >= 8:
            # Long chapter, consider breaking
            if last_story_beat in [StoryBeat.RESOLUTION, StoryBeat.DISCOVERY]:
                return True, f"Natural break after {last_story_beat.value}"
        
        # Force chapter break after 15 turns
        if turns_in_chapter >= 15:
            return True, "Chapter too long, forcing break"
        
        return False, ""
    
    def extract_npcs_from_text(self, text: str) -> List[str]:
        """
        Extract NPC names/references from text.
        
        Returns:
            List of NPC names with descriptors
        """
        npcs = []
        
        # Pattern: "Name the descriptor" or "Name, the descriptor"
        pattern = r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:the|,\s*the)\s+([a-z][a-z\s]+?)(?:\s+says|\s+asks|\s+tells|\s+looks|\s+approaches|\.|\,)'
        matches = re.findall(pattern, text)
        
        for name, descriptor in matches:
            npc = f"{name} the {descriptor.strip()}"
            if npc not in npcs:
                npcs.append(npc)
        
        # Pattern: "a descriptor named Name"
        pattern2 = r'\b[Aa]\s+([a-z][a-z\s]+?)\s+named\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'
        matches2 = re.findall(pattern2, text)
        
        for descriptor, name in matches2:
            npc = f"{name} ({descriptor.strip()})"
            if npc not in npcs:
                npcs.append(npc)
        
        return npcs
    
    def create_timeline_event(
        self,
        location: str,
        scene: str,
        summary: str,
        player_action: Optional[str] = None,
        chapter: int = 1,
        event_type: str = "SCENE_CHANGE",
        npcs_present: Optional[List[str]] = None
    ) -> Dict:
        """
        Create a structured timeline event.
        
        Returns:
            Timeline event dictionary
        """
        return {
            'id': f"event-{datetime.utcnow().timestamp()}",
            'timestamp': datetime.utcnow().isoformat(),
            'chapterNumber': chapter,
            'location': location,
            'scene': scene,
            'eventType': event_type,
            'summary': summary,
            'playerAction': player_action,
            'npcsPresent': npcs_present or [],
        }
