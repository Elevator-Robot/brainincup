import boto3
import json
from boto3.dynamodb.conditions import Key


class MemoryAgent:
    def __init__(self, dynamodb_table):
        if not dynamodb_table:
            raise ValueError("dynamodb_table must be provided")

        self.dynamodb_table = dynamodb_table
        self.dynamodb_client = boto3.resource("dynamodb")
        self.table = self.dynamodb_client.Table(self.dynamodb_table)

    def load_conversation_history(self, conversation_id):
        """Load conversation history by conversation_id (sorted by timestamp ascending)."""
        response = self.table.query(
            KeyConditionExpression=Key("id").eq(conversation_id),
            ScanIndexForward=True,  # Oldest to newest
        )
        return response.get("Items", [])

    def save_conversation_history(
        self, conversation_id, user_input, response, timestamp
    ):
        """Append a single interaction to the conversation history."""
        item = {
            "id": conversation_id,  # Ensure the id is set
            "conversation_id": conversation_id,
            "timestamp": timestamp,
            "user_input": user_input,
            "response": response,
        }
        self.table.put_item(Item=item)

    def retrieve_context(self, conversation_history, n=5):
        """Get the last n interactions from history"""
        recent = conversation_history[-n:] if conversation_history else []
        context = ""
        for interaction in recent:
            user_input = interaction.get("user_input", "")
            response = interaction.get("response", "")
            context += f"User: {user_input}\n"
            context += f"Brain: {response}\n\n"
        return context
