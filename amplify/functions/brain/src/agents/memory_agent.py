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
        self.message_table = self.dynamodb_client.Table(self.message_table_name)  # type: ignore

        self.response_table_name = getenv("RESPONSE_TABLE_NAME")
        if not self.response_table_name:
            raise ValueError("RESPONSE_TABLE_NAME environment variable must be set")
        self.response_table = self.dynamodb_client.Table(self.response_table_name)  # type: ignore

    def get_last_message_id(self):
        """Retrieve the message ID of the last message in the conversation."""
        conversation_history = self.load_conversation_history()
        if conversation_history:
            return conversation_history[-1].get("id")
        return None

    def load_conversation_history(self):
        """Load conversation history by conversation_id (sorted by timestamp ascending)."""
        response = self.message_table.query(
            IndexName="gsi-Conversation.messages",
            KeyConditionExpression=Key("conversationId").eq(self.conversation_id),
            ScanIndexForward=True,  # Oldest to newest
        )
        return response.get("Items", [])

    def save_response(self, response):
        """Save the AI-generated response to the response table."""
        response_item = {
            "id": str(uuid.uuid4()),  # Separate ID for the response
            "conversationId": self.conversation_id,
            "messageId": self.get_last_message_id() or None,
            "response": response,
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
