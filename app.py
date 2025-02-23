import boto3
import json

# Initialize the Bedrock client
client = boto3.client("bedrock-runtime")

# Define the model ID for the Nova model
model_id = "amazon.nova-pro-v1:0"

# Create the request payload
payload = {
    "prompt": "Tell me a crude but short joke with one cuss word.",
    "max_tokens_to_sample": 150,  # Adjust as needed
    "temperature": 0.7,  # Adjust as needed
    "top_p": 0.9,  # Adjust as needed
}

# Convert the payload to a JSON string
body = json.dumps(payload)

# Invoke the model
response = client.invoke_model(
    modelId=model_id,
    body=body,
    contentType="application/json",
    accept="application/json",
)

# Parse the response
response_body = json.loads(response["body"].read())
generated_text = response_body.get("completion", "")

print("Model's response:", generated_text)
