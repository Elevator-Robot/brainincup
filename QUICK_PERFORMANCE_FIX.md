# Quick Performance Fix - Phase 1 Implementation

**Time Required:** ~3 hours  
**Expected Improvement:** 40-60% latency reduction  
**Difficulty:** Easy

---

## Changes to Make

### 1. Optimize DynamoDB Stream Configuration (5 minutes)

**File:** `amplify/backend.ts`

**Current:**
```typescript
new EventSourceMapping(stack, 'BrainMessageMapping', {
  target: brainLambda,
  eventSourceArn: messageTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
});
```

**Replace with:**
```typescript
new EventSourceMapping(stack, 'BrainMessageMapping', {
  target: brainLambda,
  eventSourceArn: messageTable.tableStreamArn,
  startingPosition: StartingPosition.LATEST,
  batchSize: 1, // Process messages immediately
  maximumBatchingWindowInSeconds: 0, // No batching delay
  bisectBatchOnError: true, // Don't block subsequent messages
  retryAttempts: 2, // Fail faster
});
```

---

### 2. Increase Lambda Memory & Add Reserved Concurrency (5 minutes)

**File:** `amplify/functions/brain/resource.ts`

**Current:**
```typescript
export const brain = defineFunction((scope) => {
  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_12,
    handler: 'handler.main',
    code: Code.fromAsset(join(__dirname, 'src'), {
    }),
    timeout: Duration.seconds(60),
  });
});
```

**Replace with:**
```typescript
export const brain = defineFunction((scope) => {
  return new Function(scope, 'BrainFunction', {
    runtime: Runtime.PYTHON_3_12,
    handler: 'handler.main',
    code: Code.fromAsset(join(__dirname, 'src'), {
    }),
    timeout: Duration.seconds(60),
    memorySize: 512, // Increased from default 128MB
    reservedConcurrentExecutions: 2, // Keep 2 warm instances
  });
});
```

---

### 3. Add Optimistic UI Updates (2-3 hours)

**File:** `src/App.tsx`

Find the `handleSendMessage` function and update it:

**Current pattern** (find something like this):
```typescript
const handleSendMessage = async () => {
  // ... validation ...
  
  // Create message in backend
  const { data: newMessage } = await dataClient.models.Message.create({
    conversationId: conversationId,
    content: inputMessage,
    // ... other fields
  });
  
  setInputMessage('');
};
```

**Replace with optimistic update pattern:**
```typescript
const handleSendMessage = async () => {
  if (!inputMessage.trim() || !conversationId) return;
  
  const messageContent = inputMessage.trim();
  const tempId = `temp-${Date.now()}`;
  
  // 1. IMMEDIATELY show user message + loading indicator
  setMessages(prev => [
    ...prev,
    { role: 'user', content: messageContent },
    { role: 'assistant', content: '●●●', isLoading: true } // or use a spinner
  ]);
  
  // 2. Clear input immediately (instant feedback)
  setInputMessage('');
  setIsWaitingForResponse(true);
  
  // 3. THEN send to backend (in background)
  try {
    const { data: newMessage } = await dataClient.models.Message.create({
      conversationId: conversationId,
      content: messageContent,
      senderId: userAttributes?.sub || 'unknown',
      timestamp: new Date().toISOString(),
    });
    
    console.log('✅ Message sent:', newMessage);
  } catch (error) {
    console.error('❌ Error sending message:', error);
    
    // On error, remove the optimistic updates
    setMessages(prev => prev.filter(m => 
      !(m.role === 'assistant' && m.isLoading)
    ));
    setIsWaitingForResponse(false);
    
    // Optionally show error message
    alert('Failed to send message. Please try again.');
  }
};
```

**Also update the subscription handler to remove loading state:**

Find where you handle subscription responses and update:

```typescript
// In subscription handler
next: (result: GraphQLSubscriptionResult) => {
  console.log('Subscription received:', result);
  
  const brainResponse = result.data?.onCreateBrainResponse;
  if (brainResponse) {
    setMessages(prev => {
      // Remove loading message
      const withoutLoading = prev.filter(m => !m.isLoading);
      
      // Add actual response
      return [
        ...withoutLoading,
        {
          role: 'assistant',
          content: brainResponse.response,
          isLoading: false
        }
      ];
    });
    
    setIsWaitingForResponse(false);
  }
}
```

---

### 4. Add Loading State Component (30 minutes)

**Create:** `src/components/TypingIndicator.tsx`

```typescript
interface TypingIndicatorProps {
  className?: string;
}

export default function TypingIndicator({ className = '' }: TypingIndicatorProps) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
    </div>
  );
}
```

**Update:** `src/App.tsx` - Import and use it:

```typescript
import TypingIndicator from './components/TypingIndicator';

// In your message rendering:
{message.isLoading ? (
  <div className="flex items-center gap-2">
    <TypingIndicator />
    <span className="text-sm text-gray-500">Brain is thinking...</span>
  </div>
) : (
  <div>{message.content}</div>
)}
```

---

## Deploy Changes

```bash
# 1. Deploy backend changes
npx ampx sandbox

# 2. Wait for deployment to complete (~3-5 minutes)

# 3. Test locally
npm run dev

# 4. Build and deploy frontend
npm run build
```

---

## Testing the Improvements

### Test 1: Cold Start
1. Wait 15 minutes without using the app
2. Send a message
3. **Before:** 5-15 seconds
4. **After:** 1-3 seconds (should see instant UI feedback)

### Test 2: Warm Lambda
1. Send a message
2. Within 1 minute, send another
3. **Before:** 3-8 seconds
4. **After:** 1-3 seconds

### Test 3: "Stuck" Messages
1. Send multiple messages rapidly
2. **Before:** Some messages delayed 5-10 seconds
3. **After:** All messages process within 3 seconds

### Test 4: UI Responsiveness
1. Type a message and hit send
2. **Before:** Button disabled, waiting for backend
3. **After:** Instant feedback, message appears immediately

---

## Monitoring Results

### CloudWatch Metrics to Watch

```bash
# View Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=BrainFunction \
  --statistics Average,Maximum \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300
```

### Key Metrics
- **Cold Start Duration:** Should drop from 5-15s → 1-3s
- **Warm Duration:** Should be 2-5s consistently
- **Message Processing:** Should be <3s for 95% of requests

---

## Rollback Plan

If anything goes wrong:

```bash
# 1. Revert backend.ts and resource.ts
git checkout HEAD -- amplify/backend.ts amplify/functions/brain/resource.ts

# 2. Redeploy
npx ampx sandbox

# 3. Revert frontend if needed
git checkout HEAD -- src/App.tsx
npm run build
```

---

## Expected Cost Increase

- Reserved Concurrency: ~$2-5/month
- Increased Memory: ~$1-3/month
- **Total: ~$3-8/month** for low traffic

For high traffic (1000+ users), consider:
- Adjusting reserved concurrency to 5-10 instances
- Cost would increase to $10-25/month

---

## Next Steps After Phase 1

Once these changes are deployed and tested:

1. **Measure the improvement** - Track before/after metrics
2. **Review PERFORMANCE_IMPROVEMENTS.md** - Plan Phase 2
3. **Consider streaming responses** - Biggest UX improvement
4. **Optimize Lambda layer** - Reduce cold start further

---

## Troubleshooting

### Issue: "reservedConcurrentExecutions" not working
**Solution:** Make sure you're using AWS Lambda, not Amplify Function wrapper. The changes above use CDK's `Function` directly, which supports this.

### Issue: Messages still delayed
**Solution:** Check CloudWatch logs for the Lambda function:
```bash
npx aws logs tail /aws/lambda/BrainFunction --follow
```

Look for:
- Cold start indicators
- DynamoDB query latency
- Bedrock API call duration

### Issue: UI updates but subscription doesn't fire
**Solution:** Check AppSync subscription in browser console. May need to refresh the subscription connection.

---

## Success Criteria

✅ User sees message immediately after sending  
✅ Loading indicator appears within 100ms  
✅ Response appears within 3 seconds (warm Lambda)  
✅ No more "stuck" messages that fire late  
✅ Cold starts happen <10% of the time  

---

Ready to implement? Start with Step 1 (DynamoDB Stream) - it's the quickest win! 🚀
