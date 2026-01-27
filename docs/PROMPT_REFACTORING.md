# Prompt Architecture Refactoring for Brain In Cup

## Objective
Refactor the current Bedrock + AgentCore invocation flow so that prompt construction lives in AgentCore prompt templates, not in Lambda code.

## Current State (Anti-Pattern)

**Brain In Cup Lambda Flow:**
- Lambda's `PerceptionAgent` compiles a large, fully-rendered prompt string
- Lambda sends that full prompt to AgentCore runtime
- AgentCore forwards it to the Bedrock model (Claude)
- This makes AgentCore a thin pass-through and reduces observability, reuse, and control

**Current Code Location:**
```python
# amplify/functions/brain/src/agents/perception_agent.py
formatted_prompt = self.perception_agent.process_input(user_input, context)

# amplify/functions/brain/src/agents/language_agent.py
response = self.agent_client.invoke(session_id=session_id, payload=payload)
```

## Target State (Desired Design)

**Improved Flow:**
- AgentCore owns the prompt template
- Lambda sends structured inputs only (variables, intent, metadata)
- AgentCore assembles the final prompt and invokes Bedrock

## Design Requirements

### 1. Create AgentCore Prompt Template

Define prompt templates in AgentCore that:
- Define the system role/instructions for each personality mode:
  - `default` - Brain in a vat persona
  - `game_master` - RPG game master persona
  - Additional modes as needed
- Use placeholders for dynamic inputs:
  - `{{user_input}}` - User's current message
  - `{{context}}` - Conversation history
  - `{{character_name}}` - Player's character name (Game Master mode)
  - `{{character_stats}}` - Character stats and inventory (Game Master mode)
  - `{{personality_mode}}` - Current personality/mode
  - `{{constraints}}` - Response constraints or guidelines

**Example Template Structure:**

```json
{
  "templateName": "brain_default_persona",
  "systemPrompt": "You are {{persona_name}}, a disembodied brain floating in a nutrient-rich liquid...",
  "userPromptTemplate": "Context: {{context}}\n\nUser: {{user_input}}\n\nRespond as the Brain.",
  "variables": ["persona_name", "context", "user_input"],
  "modelConfig": {
    "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "temperature": 1.0,
    "topP": 1.0,
    "maxTokens": 2048
  }
}
```

### 2. Update Lambda Invocation Pattern

**Lambda should:**
- Stop assembling large prompt strings in `PerceptionAgent`
- Send structured payload with variables only
- Map data to template variables

**Before (Current):**
```python
# Lambda constructs full prompt
formatted_prompt = f"""
You are Brain, a disembodied brain...
Context: {context}
User: {user_input}
"""
payload = {"prompt": formatted_prompt, ...}
```

**After (Target):**
```python
# Lambda sends structured data
payload = {
    "template": "brain_default_persona",
    "variables": {
        "persona_name": "Brain",
        "context": context,
        "user_input": user_input,
        "character_name": character_data.get("name") if character_data else None,
        "personality_mode": personality_mode
    },
    "metadata": {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "owner": owner
    }
}
```

### 3. Configuration Requirements

**AgentCore Configuration:**
- Bedrock model ID defined in AgentCore runtime
- Prompt template versioning supported
- Template selection based on personality mode
- No Lambda redeployment needed for prompt changes

**Environment Variables:**
```bash
AGENTCORE_RUNTIME_ARN="arn:aws:bedrock-agentcore:..."
AGENTCORE_DEFAULT_TEMPLATE="brain_default_persona"
AGENTCORE_GAME_MASTER_TEMPLATE="brain_game_master"
```

### 4. Lambda Responsibilities (Limited Scope)

**What Lambda Should Do:**
1. **Input validation** - Verify message structure, user authentication
2. **Context gathering** - Fetch conversation history from DynamoDB
3. **Variable mapping** - Map database fields to template variables
4. **Character data retrieval** - Load character stats for Game Master mode
5. **Response processing** - Parse AgentCore response, save to database

**What Lambda Should NOT Do:**
- ❌ Construct full prompt text
- ❌ Embed personality descriptions
- ❌ Format conversation history into prompt
- ❌ Define model parameters

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Request                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Lambda (Brain Function)                                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Validate input                                          │  │
│  │ 2. Fetch conversation history from DynamoDB               │  │
│  │ 3. Load character data (Game Master mode)                 │  │
│  │ 4. Map to variables:                                       │  │
│  │    - user_input, context, character_name, etc.            │  │
│  │ 5. Select template based on personality_mode              │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Structured JSON payload
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AgentCore Runtime                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Load prompt template by name                           │  │
│  │ 2. Inject variables into placeholders                     │  │
│  │ 3. Assemble final prompt                                  │  │
│  │ 4. Apply model configuration                              │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Rendered prompt
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Amazon Bedrock (Claude 3.5 Sonnet)                             │
│  - Receives fully-formed prompt                                 │
│  - Generates response                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Response
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  AgentCore Runtime                                               │
│  - Returns structured response                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Lambda (Brain Function)                                         │
│  - Parse response                                                │
│  - Save to DynamoDB                                              │
│  - Return to client                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Out of Scope

- ❌ UI changes in React frontend
- ❌ Model fine-tuning or training
- ❌ Advanced agent routing logic
- ❌ Multi-agent orchestration

## Deliverables

### 1. AgentCore Prompt Templates

**Location:** AgentCore runtime configuration

**Templates Needed:**
- `brain_default_persona` - Standard Brain persona
- `brain_game_master` - RPG Game Master mode
- (Future: `brain_debate`, `brain_therapy`, etc.)

### 2. Updated Lambda Code

**Files to Modify:**
- `amplify/functions/brain/src/agents/perception_agent.py` - Remove prompt assembly
- `amplify/functions/brain/src/agents/language_agent.py` - Update payload structure
- `amplify/functions/brain/src/core/controller.py` - Pass variables instead of formatted text

**Pseudocode:**
```python
# controller.py
def process_input(self, user_input, message_id, owner, user_context):
    # Gather variables
    variables = {
        "user_input": user_input,
        "context": self.memory_agent.retrieve_context(),
        "character_name": user_context,
        "personality_mode": self.personality_mode
    }
    
    # Select template
    template_name = self._get_template_for_mode(self.personality_mode)
    
    # Invoke AgentCore with structured payload
    response = self.language_agent.generate_response(
        template=template_name,
        variables=variables,
        session_id=self.conversation_id,
        metadata={"message_id": message_id, "owner": owner}
    )
    
    return response
```

### 3. Data Flow Documentation

See diagram above showing:
- Lambda → AgentCore → Bedrock flow
- Data passed at each stage
- Responsibilities at each layer

## Guiding Principle

**Lambda passes data, AgentCore owns language.**

## Benefits of This Approach

1. **Separation of Concerns**
   - Lambda: Business logic, data access
   - AgentCore: Prompt engineering, LLM interaction

2. **Improved Observability**
   - AgentCore can log/trace prompt assembly
   - Easier debugging of prompt issues
   - Template versioning and A/B testing

3. **Flexibility**
   - Update prompts without Lambda redeployment
   - Template variants for different scenarios
   - Centralized prompt management

4. **Maintainability**
   - Prompts in one place (AgentCore)
   - Lambda code cleaner, focused on logic
   - Easier onboarding for new developers

## Implementation Steps

1. **Phase 1:** Create initial prompt templates in AgentCore
2. **Phase 2:** Update Lambda to send variables instead of formatted prompts
3. **Phase 3:** Test with existing conversations
4. **Phase 4:** Deploy and monitor
5. **Phase 5:** Iterate on prompt templates based on performance

## Current vs. Target Comparison

| Aspect | Current | Target |
|--------|---------|--------|
| Prompt Location | Lambda Python code | AgentCore templates |
| Lambda Sends | Fully formatted string | Variable dictionary |
| Model Config | Lambda environment vars | AgentCore template |
| Prompt Updates | Requires Lambda redeploy | AgentCore config change |
| Observability | Limited | Full AgentCore tracing |
| Reusability | Tied to Lambda | Shareable templates |

## Related Documentation

- [AgentCore Runtime Setup](./archive/AGENTCORE_RUNTIME_SETUP.md)
- [Feature Breakdown - State Management](./FEATURE_BREAKDOWN_STATE_MANAGEMENT.md)
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)
