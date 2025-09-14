import json
from core import Controller
from aws_lambda_powertools import Logger

logger = Logger()


@logger.inject_lambda_context
def main(event, context):
    responses = []

    for record in event.get(\"Records\", []):
        if record[\"eventName\"] in [\"INSERT\", \"MODIFY\"]:
            new_image = record[\"dynamodb\"].get(\"NewImage\", {})
            user_input = new_image.get(\"content\", {}).get(
                \"S\"
            )  # Adjust if it's a nested map or string
            conversation_id = new_image.get(\"conversationId\", {}).get(\"S\")

            logger.debug(f\"User input: {user_input}\")
            logger.debug(f\"Conversation ID: {conversation_id}\")

            if user_input and conversation_id:
                controller = Controller(conversation_id)
                response = controller.process_input(user_input)
                responses.append({\"user_input\": user_input, \"response\": response})

    logger.info(f"Processed {len(responses)} records")
    logger.debug(f"Responses: {responses}")
    logger.info(f"Event: {event}")

    return {"statusCode": 200, "body": json.dumps(responses)}
