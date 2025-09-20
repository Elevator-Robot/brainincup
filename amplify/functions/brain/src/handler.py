import json
from core import Controller
from aws_lambda_powertools import Logger

logger = Logger()


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
                
                # Log what we have
                logger.info(f"Processing message - ConversationId: {conversation_id}, MessageId: {final_message_id}, Owner: {final_owner}")
                
                controller = Controller(conversation_id)
                response = controller.process_input(user_input, final_message_id, final_owner)
                responses.append({"user_input": user_input, "response": response})
            else:
                logger.warning(f"Missing required fields - user_input: {bool(user_input)}, conversation_id: {bool(conversation_id)}")

    logger.info(f"Processed {len(responses)} records")
    logger.debug(f"Responses: {responses}")
    logger.info(f"Event: {event}")

    return {"statusCode": 200, "body": json.dumps(responses)}