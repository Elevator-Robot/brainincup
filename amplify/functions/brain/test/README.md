# Brain Function Test Data

## Sample Events

### `sample-event.json`
DynamoDB stream event for testing the Lambda function locally.

**Usage:**
```bash
# Test locally with AWS SAM or Lambda CLI
sam local invoke BrainFunction --event test/sample-event.json
```

This event simulates a DynamoDB INSERT operation for a new Message record.
