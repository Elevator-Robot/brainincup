# Narrative Structure System

## Overview

Brain in Cup now features a comprehensive **narrative structure system** that tracks the player's journey through the story, maintains location continuity, manages dramatic tension, and organizes the adventure into acts and chapters. This creates a more coherent, cinematic storytelling experience.

## What Changed

### Before
- No location tracking - AI could teleport players randomly
- No story structure - adventures felt disjointed
- No progression tracking - couldn't see how far you'd come
- Banner showed static placeholder text

### After
- ✅ **Location continuity** - Logical movement between places
- ✅ **Timeline of events** - Complete history of your journey
- ✅ **Act/Chapter structure** - Clear narrative progression
- ✅ **Tension tracking** - Dynamic pacing based on story beats
- ✅ **Smart banner** - Shows current location, act, and chapter

## Core Features

### 1. Dynamic Location Tracking

The system tracks where you are in the story and validates location transitions.

**How It Works:**
- AI extracts location from each response using pattern matching
- Validates transitions against visited locations
- Prevents illogical jumps (e.g., from "Tavern" to "Mountain Peak" without travel)
- Maintains `visitedLocations` array for continuity checks

**Example Flow:**
```
Turn 1: "You're in the Dusty Tavern"           → Location: Dusty Tavern
Turn 2: "You step outside to the town square"  → Location: Town Square (valid)
Turn 3: "Suddenly you're on a mountain peak"   → Rejected! No logical path
```

**Displayed in UI:**
```
┌─────────────────────────────────────┐
│  The Dusty Tavern · Act I · Ch. 1  │
└─────────────────────────────────────┘
```

### 2. Story Timeline

Every significant event is recorded in a structured timeline.

**Timeline Events Include:**
- **Location**: Where it happened
- **Scene description**: What the player saw
- **Event type**: DISCOVERY, CONFLICT, RESOLUTION, etc.
- **Player action**: What the player did
- **NPCs present**: Who was involved
- **Timestamp**: When it occurred

**Example Timeline Entry:**
```json
{
  "id": "evt_001",
  "timestamp": "2026-03-29T18:30:00Z",
  "location": "Ancient Ruins",
  "scene": "You discover a hidden chamber beneath the temple",
  "eventType": "DISCOVERY",
  "summary": "Found the Chamber of Echoes",
  "playerAction": "Pushed aside the false wall",
  "npcsPresent": ["Mysterious Stranger"],
  "tensionLevel": 6
}
```

**Timeline Pruning:**
- Keeps last 20 events to prevent unbounded growth
- Older events archived for potential future use

### 3. Act & Chapter Progression

Stories are organized into a **5-act structure** with dynamic chapter breaks.

#### Act Structure

**Act I: EXPOSITION** (Beginning)
- Setting the stage
- Introducing the world
- Tension: 1-4

**Act II: RISING_ACTION** (Complications)
- Challenges begin
- Stakes increase
- Tension: 5-7
- Triggers: Tension ≥5 + 3+ turns in Exposition

**Act III: CLIMAX** (Peak)
- Major confrontation
- Highest stakes
- Tension: 8-10
- Triggers: Tension ≥8 + 10+ turns in Rising Action

**Act IV: FALLING_ACTION** (Aftermath)
- Consequences unfold
- Tension decreases
- Tension: 3-6
- Triggers: Tension ≤5 after Climax

**Act V: RESOLUTION** (Ending)
- Wrapping up
- Final outcomes
- Tension: 1-3
- Triggers: Tension ≤3 + 15+ turns in Falling Action

#### Chapter Progression

Chapters advance based on:
- **Time**: Every 8-15 turns
- **Story beats**: After RESOLUTION or DISCOVERY events
- **Major transitions**: Significant location changes

**Example Progression:**
```
Start → Act I, Ch. 1   (Exposition)
Turn 5 → Act I, Ch. 2  (Discovery event)
Turn 12 → Act II, Ch. 3 (Tension reached 5)
Turn 25 → Act III, Ch. 5 (Climax, tension at 8)
```

### 4. Tension Tracking

Tension measures dramatic intensity (1-10 scale).

#### How Tension Changes

**Increases:**
- CONFLICT event: +2
- DISCOVERY event: +1
- Action-heavy responses: +1

**Decreases:**
- RESOLUTION event: -2
- Calm, peaceful moments: -1
- Time passing without conflict: -1

**Bounds:**
- Minimum: 1
- Maximum: 10

**Example Tension Flow:**
```
Start: 3 (tavern scene)
→ Discovery: 4 (found quest hook)
→ Conflict: 6 (ambush!)
→ Conflict: 8 (fierce battle)
→ Resolution: 6 (defeated enemies)
→ Calm: 5 (resting at camp)
```

### 5. Story Beat Detection

The system recognizes narrative moments using pattern matching.

**Detected Beats:**

**DISCOVERY**
- Patterns: "discover", "find", "uncover", "reveal"
- Example: "You discover a hidden passage"

**CONFLICT**
- Patterns: "attack", "battle", "fight", "confront"
- Example: "Guards block your path"

**RESOLUTION**
- Patterns: "resolve", "conclude", "settle", "finish"
- Example: "The dispute is finally settled"

**BETRAYAL**
- Patterns: "betray", "deceive", "trick", "double-cross"
- Example: "Your ally reveals their true colors"

**SACRIFICE**
- Patterns: "sacrifice", "give up", "lose", "cost"
- Example: "Saving the village costs you dearly"

**REVELATION**
- Patterns: "learn", "realize", "truth", "secret"
- Example: "You learn the truth about your past"

**VICTORY**
- Patterns: "win", "triumph", "succeed", "prevail"
- Example: "You emerge victorious"

**DEFEAT**
- Patterns: "lose", "fail", "fall", "defeated"
- Example: "You're forced to retreat"

## Technical Architecture

### Data Model

**GameMasterAdventure Table** (DynamoDB)
```typescript
{
  id: string                      // Primary key
  conversationId: string          // Links to conversation
  userId: string                  // Owner
  
  // Location tracking
  currentLocation: string         // "The Dusty Tavern"
  currentScene: string            // Current scene description
  visitedLocations: string[]      // ["Tavern", "Town Square", ...]
  
  // Story structure
  currentAct: "EXPOSITION" | "RISING_ACTION" | "CLIMAX" | "FALLING_ACTION" | "RESOLUTION"
  currentChapter: number          // 1, 2, 3, ...
  tensionLevel: number            // 1-10
  
  // Timeline
  timeline: TimelineEvent[]       // Last 20 events
  
  // Quest tracking
  activeObjectives: string[]      // Current goals
  criticalChoices: Choice[]       // Major decisions made
  storyArc: string                // High-level arc description
  
  // Metadata
  turnCount: number
  createdAt: string
  updatedAt: string
}
```

### Processing Flow

```
1. Player sends message
   ↓
2. Lambda receives via AppSync
   ↓
3. GameMasterModeHandler processes
   ↓
4. AgentCore generates response
   ↓
5. NarrativeExtractor analyzes response
   ├─ Extract location
   ├─ Validate transition
   ├─ Detect story beat
   ├─ Calculate tension change
   ├─ Check act advancement
   └─ Check chapter advancement
   ↓
6. Update GameMasterAdventure in DynamoDB
   ↓
7. Frontend fetches updated state
   ↓
8. UI updates banner with location/act/chapter
```

### Code Structure

**Backend (`amplify/functions/brain/src/`)**

```
core/
├── narrative_extractor.py       # Core extraction logic
│   ├── extract_location()       # Find location in text
│   ├── validate_location_transition()
│   ├── detect_story_beat()      # Identify narrative moments
│   ├── calculate_tension_change()
│   ├── should_advance_act()     # Check act progression
│   └── should_advance_chapter()
│
└── mode_handlers.py             # Integration
    ├── GameMasterModeHandler
    │   ├── _format_narrative_context()   # Add context to prompts
    │   └── _update_narrative_structure() # Update after response
```

**Frontend (`src/`)**

```typescript
App.tsx
├── useEffect → fetchAdventure()  // Load adventure state
├── currentLocation memo          // Extract location
├── currentAct memo               // Format act display
└── currentChapter memo           // Extract chapter number

Banner Display:
┌─────────────────────────────────────┐
│  {location} · Act {roman} · Ch. {n} │
└─────────────────────────────────────┘
```

## Configuration

### Location Extraction Patterns

Defined in `narrative_extractor.py`:

```python
LOCATION_PATTERNS = [
    r"you (?:arrive at|enter|reach|find yourself (?:in|at)) (?:the )?([A-Z][^,.!?]+)",
    r"(?:welcome to|entering) (?:the )?([A-Z][^,.!?]+)",
    r"(?:at|in) the ([A-Z][^,.!?]+)",
    r"the scene shifts to (?:the )?([A-Z][^,.!?]+)",
]
```

### Act Progression Thresholds

```python
ACT_TRANSITIONS = {
    "EXPOSITION → RISING_ACTION": {
        "min_tension": 5,
        "min_turns": 3
    },
    "RISING_ACTION → CLIMAX": {
        "min_tension": 8,
        "min_turns": 10
    },
    "CLIMAX → FALLING_ACTION": {
        "max_tension": 5,
        "min_turns": 5
    },
    "FALLING_ACTION → RESOLUTION": {
        "max_tension": 3,
        "min_turns": 15
    }
}
```

### Chapter Break Triggers

```python
CHAPTER_BREAK_CONDITIONS = {
    "turn_range": (8, 15),           # Every 8-15 turns
    "story_beats": ["RESOLUTION", "DISCOVERY"],
    "major_location_change": True
}
```

## Usage Examples

### Viewing Your Journey

The banner always shows your current position:

```
┌────────────────────────────────┐
│  Ancient Ruins · Act II · Ch. 3 │
└────────────────────────────────┘
```

### Timeline Access (Future Feature)

While not yet exposed in UI, the timeline is stored and can be queried:

```graphql
query GetAdventure($id: ID!) {
  getGameMasterAdventure(id: $id) {
    timeline {
      id
      timestamp
      location
      eventType
      summary
      playerAction
      npcsPresent
    }
  }
}
```

### Checking Story Progress

```graphql
query GetAdventure($id: ID!) {
  getGameMasterAdventure(id: $id) {
    currentAct
    currentChapter
    tensionLevel
    turnCount
    visitedLocations
  }
}
```

## Limitations & Future Enhancements

### Current Limitations

1. **Location extraction relies on patterns** - May miss unconventional phrasings
2. **Timeline capped at 20 events** - Older history not accessible
3. **No timeline UI** - Data collected but not displayed yet
4. **Single story arc** - No branching storylines tracked
5. **Tension is heuristic** - Based on keywords, not semantic understanding

### Planned Enhancements

**Phase 3 Features** (from original plan):
- [ ] Quest objective tracking UI
- [ ] Story arc metadata and tension graph
- [ ] Character personality development tracking
- [ ] Player choice consequence system
- [ ] Timeline viewer in UI

**Additional Ideas:**
- **Memory integration**: Link timeline to AgentCore memory
- **Smart recaps**: Generate summaries from timeline
- **Relationship tracking**: Track NPC relationships over time
- **Location maps**: Visual representation of visited places
- **Story analytics**: Charts showing tension curve, location frequency

## Testing

### Verify Location Tracking

1. Start new adventure
2. Check banner shows initial location
3. Travel to a new place
4. Verify banner updates
5. Try to teleport somewhere illogical
6. Confirm AI keeps you in logical locations

### Verify Act Progression

1. Start at Act I (EXPOSITION)
2. Engage in conflicts to raise tension
3. After tension hits 5+, verify Act II
4. Continue escalating to Act III (CLIMAX)
5. Resolve conflict to lower tension
6. Verify Acts IV and V trigger appropriately

### Verify Chapter Progression

1. Play through 10-15 turns
2. Check chapter increments
3. Trigger a major DISCOVERY or RESOLUTION
4. Verify chapter advances immediately

## Troubleshooting

### Banner Shows Wrong Location

**Cause**: Location extraction pattern didn't match  
**Fix**: Check `narrative_extractor.py` patterns, add new pattern if needed

### Acts Not Progressing

**Cause**: Tension not reaching thresholds or turn count too low  
**Fix**: Check `should_advance_act()` logic, verify tension calculations

### Chapters Advancing Too Fast

**Cause**: Too many story beats detected  
**Fix**: Adjust chapter break conditions in `should_advance_chapter()`

### Timeline Missing Events

**Cause**: Timeline capped at 20 events  
**Fix**: Increase `MAX_TIMELINE_EVENTS` or implement archiving

## Performance Considerations

**Extraction**: O(n) where n = response length (~500-2000 chars)  
**Validation**: O(m) where m = visited locations (~10-50 items)  
**Timeline Updates**: O(1) append, O(n) prune if > 20 events  

**Total overhead per response**: ~5-10ms

## References

- **Schema**: `amplify/data/resource.ts` (lines 49-81)
- **Extractor**: `amplify/functions/brain/src/core/narrative_extractor.py`
- **Integration**: `amplify/functions/brain/src/core/mode_handlers.py` (lines 127-149, 695-856)
- **Frontend**: `src/App.tsx` (lines 1916-1945, 2217-2220)
- **Architecture Doc**: `~/.copilot/session-state/.../files/narrative-architecture.md`

## Summary

The narrative structure system transforms Brain in Cup from a disconnected chatbot into a **structured storytelling engine**. By tracking location, progression, and dramatic tension, it creates adventures that feel cohesive, cinematic, and purposeful.

Players now experience:
- ✅ Logical world navigation
- ✅ Clear story progression
- ✅ Dynamic pacing
- ✅ Persistent journey history

The system runs transparently in the background, requiring no player interaction while enhancing every conversation.
