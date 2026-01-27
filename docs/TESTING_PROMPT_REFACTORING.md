# Testing Guide: Prompt Refactoring

This guide explains how to test the prompt refactoring changes safely.

## ⚠️ Current State

**The code changes WILL BREAK your existing setup** until AgentCore is configured to handle the new payload format.

**What Changed:**
- Lambda now sends `{"template": "...", "variables": {...}}` 
- Instead of `{"prompt": "fully formatted string"}`
- AgentCore needs to be updated to understand this new format

## Testing Strategy

### Phase 1: Mock Testing (START HERE)

Test variable mapping WITHOUT full AgentCore integration.

#### Step 1: Add Mock Response Mode

Create a temporary test mode in LanguageAgent:

```python
# In language_agent.py - add this method temporarily
def generate_response_mock_mode(self, variables, session_id, metadata=None):
    """Temporary mock mode for testing variable mapping"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Log all variables for inspection
    logger.info("=== MOCK MODE: Variable Mapping ===")
    logger.info(f"Variables: {json.dumps(variables, indent=2)}")
    logger.info(f"Metadata: {json.dumps(metadata, indent=2)}")
    
    # Return mock response that includes variables
    return {
        "sensations": [f"Testing with character: {variables.get('character_name', 'None')}"],
        "thoughts": [f"Variables received: {list(variables.keys())}"],
        "memories": f"Context length: {len(variables.get('context', ''))} chars",
        "self_reflection": "Mock mode - AgentCore not invoked",
        "response": f"Mock response. Variables mapped correctly. Character: {variables.get('character_name', 'N/A')}"
    }
```

#### Step 2: Switch to Mock Mode

In `controller.py`, temporarily use mock mode:

```python
# Change this line:
raw_response = self.language_agent.generate_response(...)

# To this:
raw_response = self.language_agent.generate_response_mock_mode(...)
```

#### Step 3: Deploy and Test

```bash
# On the prompt-refactoring branch
git checkout feature/prompt-refactoring-agentcore-templates

# Deploy sandbox
npx ampx sandbox

# Wait for deployment
# Test in browser
```

#### Step 4: Check CloudWatch Logs

Look for log entries with "MOCK MODE: Variable Mapping" to verify:
- ✅ Character data correctly extracted from DB
- ✅ Stats properly formatted
- ✅ Inventory parsed from JSON
- ✅ Context included
- ✅ Correct template selected for personality mode

#### Step 5: Test Both Modes

1. **Test Game Master Mode:**
   - Create character
   - Send message
   - Check logs for character variables

2. **Test Default Mode:**
   - Switch to default personality
   - Send message
   - Check logs for basic variables only

### Phase 2: AgentCore Configuration

Once variable mapping is verified, configure AgentCore runtime.

#### Option A: AgentCore Runtime Container

If you have AgentCore runtime container:

1. **Update AgentCore Handler** to accept new payload format:

```python
# In AgentCore container handler
def handle_payload(payload):
    template_name = payload.get("template")
    variables = payload.get("variables", {})
    
    # Load template from storage
    template = load_template(template_name)
    
    # Inject variables into template
    rendered_prompt = render_template(template, variables)
    
    # Call Bedrock
    response = bedrock_client.converse(
        modelId=template["modelConfig"]["modelId"],
        messages=[{"role": "user", "content": rendered_prompt}],
        ...
    )
    
    return parse_response(response)
```

2. **Store Templates** in AgentCore:
   - Copy `agent-runtime/templates/*.json` to AgentCore storage
   - Configure template loader

3. **Deploy AgentCore Runtime**

#### Option B: Direct Bedrock Fallback (Simpler)

If AgentCore setup is complex, create a simpler fallback:

```python
# In language_agent.py
def generate_response(self, variables, session_id, template_name=None, metadata=None):
    """Send structured variables to AgentCore or fallback to direct Bedrock."""
    
    # Try AgentCore first
    try:
        return self._invoke_agentcore(variables, session_id, template_name, metadata)
    except Exception as e:
        logger.warning(f"AgentCore failed, using direct Bedrock fallback: {e}")
        return self._direct_bedrock_fallback(variables, session_id, template_name, metadata)

def _direct_bedrock_fallback(self, variables, session_id, template_name, metadata):
    """Direct Bedrock invocation as fallback"""
    import boto3
    import json
    import os
    
    # Load template from local files
    template_path = f"agent-runtime/templates/{template_name}.json"
    with open(template_path) as f:
        template = json.load(f)
    
    # Simple variable substitution
    system_prompt = template["systemPrompt"]
    for key, value in variables.items():
        placeholder = "{{" + key + "}}"
        system_prompt = system_prompt.replace(placeholder, str(value))
    
    user_prompt = template["userPromptTemplate"]
    for key, value in variables.items():
        placeholder = "{{" + key + "}}"
        user_prompt = user_prompt.replace(placeholder, str(value))
    
    # Call Bedrock directly
    bedrock = boto3.client("bedrock-runtime")
    response = bedrock.converse(
        modelId=template["modelConfig"]["modelId"],
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        inferenceConfig={
            "temperature": template["modelConfig"]["temperature"],
            "topP": template["modelConfig"]["topP"],
            "maxTokens": template["modelConfig"]["maxTokens"]
        }
    )
    
    # Parse response
    text = response["output"]["message"]["content"][0]["text"]
    try:
        return json.loads(text)
    except:
        # Fallback if not JSON
        return {
            "response": text,
            "sensations": [],
            "thoughts": [],
            "memories": "",
            "self_reflection": ""
        }
```

### Phase 3: Full Integration Testing

Once AgentCore is configured:

#### Test Cases

1. **Default Mode Conversation**
   ```
   User: "Hello, how are you?"
   Expected: Brain persona response with existential musings
   ```

2. **Game Master Mode - Character Creation**
   ```
   - Create character "Thorin"
   - Check character name appears in response
   ```

3. **Game Master Mode - Combat**
   ```
   User: "I attack the goblin"
   Expected: Response references character stats and HP
   ```

4. **Game Master Mode - Inventory**
   ```
   User: "What's in my backpack?"
   Expected: Response lists character inventory from DB
   ```

5. **Template Switching**
   ```
   - Switch from default to game_master
   - Verify correct template used
   - Check CloudWatch logs for template selection
   ```

#### Verification Checklist

- [ ] Variables correctly extracted from DynamoDB
- [ ] Character stats properly formatted
- [ ] Inventory parsed from JSON
- [ ] Context included in payload
- [ ] Template name selected based on personality mode
- [ ] AgentCore receives correct payload structure
- [ ] Bedrock model responds appropriately
- [ ] Response parsed and saved to DB
- [ ] Frontend displays response correctly

## Rollback Plan

If testing reveals issues:

```bash
# Switch back to previous branch
git checkout feature/131-inventory-management

# Redeploy sandbox
npx ampx sandbox

# Your old code will be active again
```

## Success Criteria

✅ **Mock Testing Success:**
- CloudWatch logs show correct variable mapping
- All character data properly extracted
- No errors in Lambda execution

✅ **Integration Testing Success:**
- Responses from AgentCore/Bedrock are appropriate
- Character names appear in Game Master responses
- Both personality modes work correctly
- No increase in errors or latency

## Debugging Tips

### CloudWatch Logs to Check

1. **Variable Mapping:**
   ```
   Filter: "Sending structured payload to AgentCore"
   Look for: variable_keys, template name
   ```

2. **Character Data:**
   ```
   Filter: "Character data loaded"
   Look for: character_name, stats
   ```

3. **Errors:**
   ```
   Filter: "ERROR"
   Look for: AgentCore invocation failed, template issues
   ```

### Common Issues

**Issue**: "Template not found"
- AgentCore doesn't have template configured
- Use mock mode or direct Bedrock fallback

**Issue**: Variables not populated
- Check character data fetch in handler.py
- Verify DB has character data

**Issue**: Response format wrong
- Template might not specify JSON format
- Check template userPromptTemplate

## Next Steps After Testing

1. **Merge to main** if all tests pass
2. **Document template updates** in team wiki
3. **Monitor production** for first 24 hours
4. **Iterate on templates** based on response quality
5. **Add more templates** for additional personality modes

## Questions?

- Check `docs/PROMPT_REFACTORING.md` for architecture details
- Review `agent-runtime/templates/README.md` for template structure
- Look at example templates in `agent-runtime/templates/*.json`
