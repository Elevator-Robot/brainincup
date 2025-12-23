import json
import os
import boto3
from core import Controller
from aws_lambda_powertools import Logger

logger = Logger()


dynamodb = boto3.resource("dynamodb")
conversation_table_name = os.getenv("CONVERSATION_TABLE_NAME")
conversation_table = (
    dynamodb.Table(conversation_table_name) if conversation_table_name else None
)


def get_personality_mode(conversation_id: str) -> str:
    if not conversation_table:
        logger.warning("Conversation table not available; defaulting personality mode.")
        return "default"
    try:
        response = conversation_table.get_item(Key={"id": conversation_id})
        mode = response.get("Item", {}).get("personalityMode", "default")
        return mode or "default"
    except Exception as error:  # pragma: no cover - defensive logging
        logger.exception(
            "Failed to fetch personality mode; defaulting to base persona.",
            extra={"conversation_id": conversation_id, "error": str(error)},
        )
        return "default"


@logger.inject_lambda_context
def main(event, context):
    responses = []

    for record in event.get("Records", []):
        if record["eventName"] in ["INSERT", "MODIFY"]:
            new_image = record["dynamodb"].get("NewImage", {})
            user_input = new_image.get("content", {}).get(
                "S"
            )  # Adjust if it's a nested map or string
            conversation_id = new_image.get("conversationId", {}).get("S")
            message_id = new_image.get("id", {}).get("S")
            owner = new_image.get("owner", {}).get("S")

            logger.debug(f"User input: {user_input}")
            logger.debug(f"Conversation ID: {conversation_id}")
            logger.debug(f"Message ID: {message_id}")
            logger.debug(f"Owner: {owner}")

            if user_input and conversation_id:
                # Use provided values or None as fallback
                final_message_id = message_id
                final_owner = owner
                personality_mode = get_personality_mode(conversation_id)

                logger.info(
                    "Processing message",
                    extra={
                        "conversation_id": conversation_id,
                        "message_id": final_message_id,
                        "owner": final_owner,
                        "personality_mode": personality_mode,
                    },
                )

                controller = Controller(conversation_id, personality_mode)
                response = controller.process_input(
                    user_input, final_message_id, final_owner
                )
                responses.append({"user_input": user_input, "response": response})
            else:
                logger.warning(
                    "Missing required fields",
                    extra={
                        "has_user_input": bool(user_input),
                        "has_conversation_id": bool(conversation_id),
                    },
                )

    logger.info(f"Processed {len(responses)} records")
    logger.debug(f"Responses: {responses}")
    logger.info(f"Event: {event}")

    return {"statusCode": 200, "body": json.dumps(responses)}