# Brain Mode Architecture - Unified Experience

## Overview

The app now has a unified experience model where **Brain** is the constant home screen and **Game Master** conversations are the variable adventures.

## New Model

### Brain (Singular, Persistent)
- **One conversation per user** - Brain is a singular, persistent entity
- **Always accessible** - Brain avatar is always visible at the top of the sidebar
- **Auto-created** - Brain conversation is automatically created on first login
- **Auto-loaded** - Brain conversation loads by default when no GM conversation is active
- **Cannot be deleted** - Brain conversation persists forever (for now)

### Game Master (Multiple, Variable)
- **Multiple conversations** - Users can have many GM adventures
- **Created via "New Chat"** - The "New Chat" button always creates a new GM conversation
- **Shown in sidebar** - GM conversations appear below the Brain avatar in the sidebar
- **Character creation** - Each GM conversation requires character creation

## UX Flow

1. **Login** → User sees their last active conversation (Brain or GM)
2. **No active conversation** → Brain conversation auto-loads
3. **Click Brain avatar** → Returns to the singular Brain conversation
4. **Click "New Chat"** → Creates new GM conversation with character creation
5. **Click GM conversation** → Switches to that adventure
6. **Sidebar shows** → Brain avatar (top) + GM conversations (below)

## Visual Hierarchy

### Brain Avatar (Sidebar)
- **Size**: 48x48px (larger than GM icons)
- **Border**: 2px violet border with glow effect
- **Background**: Gradient from violet to fuchsia
- **Icon**: Brain SVG with fallback to 🧠 emoji
- **Tooltip**: "Brain - Return to consciousness"
- **Position**: Always at top of sidebar, above separator

### GM Conversation Icons (Sidebar)
- **Size**: 40x40px
- **Border**: 1px neutral border
- **Background**: Character avatar or first letter
- **Position**: Below Brain avatar, separated by divider

## Implementation Details

### State Management
```typescript
// Singular Brain conversation ID
const [brainConversationId, setBrainConversationId] = useState<string | null>(null);

// Current mode determined by active conversation
const effectivePersonality: PersonalityModeId = 
  conversationId === brainConversationId ? 'brain' : 'game_master';
```

### Brain Conversation Initialization
```typescript
useEffect(() => {
  async function initializeBrainConversation() {
    // Look for existing Brain conversation
    const { data: conversations } = await dataClient.models.Conversation.list({
      filter: { personalityMode: { eq: 'brain' } },
    });
    
    if (conversations && conversations.length > 0) {
      // Use existing Brain conversation
      setBrainConversationId(conversations[0].id);
    } else {
      // Create singular Brain conversation
      const { data: newConversation } = await dataClient.models.Conversation.create({
        title: 'Brain',
        participants: [currentUserId],
        personalityMode: 'brain',
      });
      setBrainConversationId(newConversation.id);
    }
  }
  
  initializeBrainConversation();
}, [userAttributes]);
```

### Sidebar Filtering
```typescript
// ConversationSidebarIcons.tsx
// Filter out Brain conversation - only show GM conversations
const gmConversations = sorted.filter(conv => {
  const mode = normalizePersonalityMode(conv.personalityMode || 'brain');
  return mode === 'game_master';
});
```

## Key Changes from Previous Model

### Removed
- ❌ Mode selector screen
- ❌ `selectedMode` state
- ❌ Mode switching UI
- ❌ Multiple Brain conversations

### Added
- ✅ Persistent Brain conversation
- ✅ Brain avatar in sidebar
- ✅ Auto-creation of Brain conversation
- ✅ Visual distinction between Brain and GM

## Future Enhancements

1. **Brain conversation customization** - Allow users to customize Brain's personality
2. **Brain memory** - Persistent memory across sessions
3. **Brain/GM integration** - Allow Brain to reference GM adventures
4. **Conversation archiving** - Archive old GM conversations
5. **Brain reset** - Option to reset Brain conversation (with confirmation)

## Technical Notes

- Brain conversation uses `personalityMode: 'brain'` in the database
- Only one Brain conversation should exist per user (enforced by initialization logic)
- Brain conversation cannot be deleted via the trash button (filtered out)
- Mode is determined by comparing `conversationId` to `brainConversationId`
