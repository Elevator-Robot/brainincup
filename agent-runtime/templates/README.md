# AgentCore Prompt Templates for Brain In Cup

This directory contains prompt template definitions for the AgentCore runtime.

## Template Structure

Each template defines:
- **Template Name**: Unique identifier
- **System Prompt**: Base instructions/persona
- **User Prompt Template**: How to format user input
- **Variables**: Placeholders used in the template
- **Model Configuration**: Bedrock model settings

## Available Templates

### 1. brain_default_persona
Default "Brain in a vat" persona for standard conversations.

**Variables:**
- `{{persona_name}}` - Name of the persona (usually "Brain")
- `{{user_input}}` - User's current message
- `{{context}}` - Conversation history

### 2. brain_game_master
RPG Game Master mode for interactive storytelling.

**Variables:**
- `{{persona_name}}` - Game Master name
- `{{user_input}}` - Player's action/response
- `{{context}}` - Quest/story context
- `{{character_name}}` - Player's character name
- `{{character_race}}` - Character race
- `{{character_class}}` - Character class
- `{{character_level}}` - Character level
- `{{character_stats}}` - Character stats (STR, DEX, etc.)
- `{{character_hp}}` - Current/Max HP
- `{{character_inventory}}` - Character's inventory items

## Configuration

Templates are configured in the AgentCore runtime. Set environment variables before deployment:

```bash
export AGENTCORE_DEFAULT_TEMPLATE="brain_default_persona"
export AGENTCORE_GAME_MASTER_TEMPLATE="brain_game_master"
```

## Updating Templates

To update templates without redeploying Lambda:
1. Update template definition in AgentCore runtime
2. Templates are fetched dynamically by name
3. No Lambda code changes needed

## Template Files

- `brain_default_persona.json` - Default persona template
- `brain_game_master.json` - Game Master template
- (Future templates as needed)
