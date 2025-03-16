import json
from core import Controller


def lambda_handler(event, context):
    user_input = event["user_input"]
    controller = Controller()
    response = controller.process_input(user_input)
    return {
        "statusCode": 200,
        "body": json.dumps({"user_input": user_input, "response": response}),
    }
