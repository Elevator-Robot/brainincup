from os import getenv
import uuid
import boto3
import requests
from boto3.dynamodb.conditions import Key
from requests.auth import AuthBase
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from boto3.session import Session


class AWSV4Auth(AuthBase):
    def __init__(self, service, region):
        session = Session()
        credentials = session.get_credentials()
        self.credentials = credentials.get_frozen_credentials()
        self.region = region
        self.service = service

    def __call__(self, r):
        # Make a copy of headers without the 'connection' key
        cleaned_headers = {
            k: v for k, v in r.headers.items() if k.lower() != "connection"
        }

        aws_request = AWSRequest(
            method=r.method, url=r.url, data=r.body, headers=cleaned_headers
        )
        SigV4Auth(self.credentials, self.service, self.region).add_auth(aws_request)

        r.headers.update(dict(aws_request.headers))
        return r


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

        self.appsync_api_url: str = getenv("APPSYNC_API_URL") or ""
        if not self.appsync_api_url:
            raise ValueError("APPSYNC_API_URL environment variable must be set")

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
        """Save the AI-generated response to the BrainResponse table via AppSync GraphQL mutation."""
        mutation = """
        mutation CreateBrainResponse($input: CreateBrainResponseInput!) {
          createBrainResponse(input: $input) {
            id
            response
            conversationId
            messageId
            owner
          }
        }
        """

        variables = {
            "input": {
                "id": str(uuid.uuid4()),
                "conversationId": self.conversation_id,
                "messageId": self.get_last_message_id() or None,
                "response": response.get("response", ""),
                "memories": response.get("memories", ""),
                "sensations": response.get("sensations", []),
                "thoughts": response.get("thoughts", []),
                "selfReflection": response.get("self_reflection", ""),
                "owner": "f4e87478-d071-709a-9f5d-115e1e1562df",  # TODO: pull from caller identity
            }
        }

        headers = {"Content-Type": "application/json"}

        auth = AWSV4Auth(
            service="appsync", region="us-east-1"
        )  # Change region if needed

        response = requests.post(
            self.appsync_api_url,
            json={"query": mutation, "variables": variables},
            headers=headers,
            auth=auth,
        )

        if response.status_code != 200:
            raise Exception(f"GraphQL mutation failed: {response.text}")

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
