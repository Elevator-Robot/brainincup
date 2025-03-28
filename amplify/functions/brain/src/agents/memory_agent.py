from os import getenv
import uuid
import boto3
from boto3.dynamodb.conditions import Key


class MemoryAgent:
    def __init__(self, conversation_id):
        if not conversation_id:
            raise ValueError("conversation_id must be provided")
        self.conversation_id = conversation_id

        self.dynamodb_client = boto3.resource("dynamodb")

        self.message_table_name = getenv("MESSAGE_TABLE_NAME")
        if not self.message_table_name:
            raise ValueError("MESSAGE_TABLE_NAME environment variable must be set")
        self.message_table = self.dynamodb_client.Table(self.message_table_name)

        self.response_table_name = getenv("RESPONSE_TABLE_NAME")
        if not self.response_table_name:
            raise ValueError("RESPONSE_TABLE_NAME environment variable must be set")
        self.response_table = self.dynamodb_client.Table(self.response_table_name)

    def load_conversation_history(self):
        """Load conversation history by conversation_id (sorted by timestamp ascending)."""
        response = self.message_table.query(
            IndexName="gsi-Conversation.messages",
            KeyConditionExpression=Key("conversationId").eq(self.conversation_id),
            ScanIndexForward=True,  # Oldest to newest
        )
        return response.get("Items", [])

    def save_conversation_history(self, user_input, timestamp):
        """Save user input to the conversation history."""
        message_id = str(uuid.uuid4())  # Generate unique messageId
        item = {
            "id": message_id,
            "conversationId": self.conversation_id,
            "timestamp": timestamp,
            "user_input": user_input,
        }
        self.message_table.put_item(Item=item)
        return message_id

    def save_response(self, message_id, response, timestamp):
        """Save the AI-generated response to the response table."""
        response_item = {
            "id": str(uuid.uuid4()),  # Separate ID for the response
            "conversationId": self.conversation_id,
            "messageId": message_id,
            "response": response,
            "timestamp": timestamp,
        }
        self.response_table.put_item(Item=response_item)

    def retrieve_context(self, conversation_history, n=5):
        """Get the last n interactions from history."""
        recent = conversation_history[-n:] if conversation_history else []
        context = ""
        for interaction in recent:
            user_input = interaction.get("user_input", "")
            response = interaction.get("response", "")
            context += f"User: {user_input}\n"
            context += f"Brain: {response}\n\n"
        return context
