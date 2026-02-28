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
character_table_name = os.getenv("CHARACTER_TABLE_NAME")
character_table = (
    dynamodb.Table(character_table_name) if character_table_name else None
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


def get_character_data(conversation_id: str) -> dict | None:
    """
    Fetch character data for Game Master mode.
    Returns character stats, inventory, and details if available.
    """
    if not character_table:
        logger.warning("Character table not available")
        return None
    
    try:
        # Scan table filtering by conversationId (GSI might not exist yet)
        response = character_table.scan(
            FilterExpression="conversationId = :cid",
            ExpressionAttributeValues={":cid": conversation_id},
            Limit=1
        )
        
        items = response.get("Items", [])
        if not items:
            logger.info(f"No character found for conversation {conversation_id}")
            return None
        
        character = items[0]
        inventory_value = character.get("inventory", "[]")
        if isinstance(inventory_value, str):
            try:
                inventory = json.loads(inventory_value)
            except json.JSONDecodeError:
                inventory = [inventory_value] if inventory_value else []
        elif isinstance(inventory_value, list):
            inventory = inventory_value
        else:
            inventory = []
        
        # Format character data for AI context
        return {
            "name": character.get("name", "Unknown"),
            "race": character.get("race", "Unknown"),
            "class": character.get("characterClass", "Unknown"),
            "level": character.get("level", 1),
            "stats": {
                "strength": character.get("strength", 10),
                "dexterity": character.get("dexterity", 10),
                "constitution": character.get("constitution", 10),
                "intelligence": character.get("intelligence", 10),
                "wisdom": character.get("wisdom", 10),
                "charisma": character.get("charisma", 10),
            },
            "hp": {
                "current": character.get("currentHP", 10),
                "max": character.get("maxHP", 10),
            },
            "armorClass": character.get("armorClass", 10),
            "inventory": inventory,
        }
    except Exception as error:
        logger.exception(
            "Failed to fetch character data",
            extra={"conversation_id": conversation_id, "error": str(error)},
        )
        return None


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

                # Fetch character data for Game Master mode
                character_data = None
                if personality_mode == "game_master":
                    character_data = get_character_data(conversation_id)
                    if character_data:
                        logger.info(
                            "Character data loaded",
                            extra={"character_name": character_data.get("name")}
                        )

                controller = Controller(conversation_id, personality_mode, character_data)
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
