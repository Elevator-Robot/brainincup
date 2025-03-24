import json
from core import Controller


def main(event, context):
    controller = Controller()
    responses = []

    for record in event.get("Records", []):
        if record["eventName"] in ["INSERT", "MODIFY"]:
            new_image = record["dynamodb"].get("NewImage", {})
            user_input = new_image.get("user_input", {}).get(
                "S"
            )  # Adjust if it's a nested map or string

            if user_input:
                response = controller.process_input(user_input)
                responses.append({"user_input": user_input, "response": response})

    return {"statusCode": 200, "body": json.dumps(responses)}
