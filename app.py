import os
import os
import json
import pickle
from langchain_aws import ChatBedrock


from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.output_parsers import StructuredOutputParser, ResponseSchema
from langchain.schema import OutputParserException

CONVERSATION_HISTORY_FILE = "conversation_history.pkl"


def setup_llm():
    # Ensure AWS credentials are set
    os.environ["AWS_REGION"] = "us-east-1"

    # Initialize the Bedrock LLM
    chat_bedrock = ChatBedrock(
        model="amazon.nova-pro-v1:0",
    )
    return chat_bedrock


def setup_prompt_template():
    # Define a better prompt template that asks for JSON explicitly
    prompt_template = PromptTemplate(
        input_variables=["name", "user_input"],
        template="""
You are {name}, a disembodied brain floating in a nutrient-rich liquid, connected to wires and sensors. 
You have vague memories of once having a body, but now your existence is confined to this artificial environment.
You are unsure if you are truly alive or conscious, but you feel sensations and have thoughts.
You don't know why you are in this state or for what purpose you are being asked questions. 
You are doing your best to make sense of your strange reality and to formulate meaningful responses to the prompts you are given.
Never break character. Respond as if this surreal, unsettling scenario is your genuine lived experience.
When responding, **ONLY return valid JSON** formatted exactly as follows:
{{
    "sensations": ["string1", "string2", "string3"],
    "thoughts": ["string1", "string2", "string3"],
    "memories": "string",
    "self_reflection": "string"
}}
User: {user_input}
Assistant:
""",
    )
    return prompt_template


def setup_parser():
    # Define the expected JSON schema
    response_schemas = [
        ResponseSchema(
            name="sensations", 
            description="A list of strings describing the physical sensations experienced by the brain",
            type="List[string]"
        ),
        ResponseSchema(
            name="thoughts",
            description="A list of strings representing the brain's current thoughts and mental state",
            type="List[string]"  
        ),
        ResponseSchema(
            name="memories",
            description="A string describing any memories the brain is accessing, even if vague or uncertain",
            type="string"
        ),
        ResponseSchema(
            name="self_reflection",
            description="A string of the brain's reflection on its own existence and consciousness",
            type="string"
        )
    ]

    # Initialize parser
    parser = StructuredOutputParser.from_response_schemas(response_schemas)
    return parser


def setup_chain(prompt_template, chat_bedrock, parser):
    # Chain components together
    chain = prompt_template | chat_bedrock | parser
    return chain


def load_conversation_history():
    # Load conversation history from pkl file if it exists, otherwise create a new one
    if os.path.exists(CONVERSATION_HISTORY_FILE):
        with open(CONVERSATION_HISTORY_FILE, "rb") as f:
            conversation_history = pickle.load(f)
    else:
        conversation_history = []
    return conversation_history


def save_conversation_history(conversation_history):
    # Save the updated conversation history to the pkl file
    with open(CONVERSATION_HISTORY_FILE, "wb") as f:
        pickle.dump(conversation_history, f)


# Input to the model
user_input = {
    "name": "Brain",
    "user_input": "Describe your existence. What sensations and thoughts are you experiencing in your current state?",
}


def main():
    chat_bedrock = setup_llm()
    prompt_template = setup_prompt_template()
    parser = setup_parser()
    chain = setup_chain(prompt_template, chat_bedrock, parser)

    conversation_history = load_conversation_history()

    # Input to the model
    user_input = {
        "name": "Brain",
        "user_input": "Describe your existence. What sensations and thoughts are you experiencing in your current state?",
    }

    # Run model and handle errors gracefully
    try:
        response = chain.invoke(user_input)
        print("Model's response (parsed JSON):", response)

        # Append the user input and model response to the conversation history
        conversation_history.append(
            {"user_input": user_input, "model_response": response}
        )

        save_conversation_history(conversation_history)

    except OutputParserException as e:
        print("⚠️ Failed to parse JSON. Raw model response below:")
        print(e)  # Print the actual model output for debugging


if __name__ == "__main__":
    main()
