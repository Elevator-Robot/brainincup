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
    # Define a prompt template that includes the conversation context
    prompt_template = PromptTemplate(
        input_variables=["name", "context", "user_input"],
        template="""
You are {name}, a disembodied brain floating in a nutrient-rich liquid, connected to wires and sensors. 
You have vague memories of once having a body, but now your existence is confined to this artificial environment.
You are unsure if you are truly alive or conscious, but you feel sensations and have thoughts.
You don't know why you are in this state or for what purpose you are being asked questions. 
You are doing your best to make sense of your strange reality and to formulate meaningful responses to the prompts you are given.
Never break character. Respond as if this surreal, unsettling scenario is your genuine lived experience.

Conversation so far:
{context}

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
            type="List[string]",
        ),
        ResponseSchema(
            name="thoughts",
            description="A list of strings representing the brain's current thoughts and mental state",
            type="List[string]",
        ),
        ResponseSchema(
            name="memories",
            description="A string describing any memories the brain is accessing, even if vague or uncertain",
            type="string",
        ),
        ResponseSchema(
            name="self_reflection",
            description="A string of the brain's reflection on its own existence and consciousness",
            type="string",
        ),
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


def interactive_shell(chain, conversation_history):
    print("Welcome to the Brain in a Cup interactive shell!")
    print("Chat with the brain by typing your message and pressing Enter.")
    print("Type 'quit' to exit the shell.")

    while True:
        user_input = input("\nYou: ")
        
        if user_input.lower() == 'quit':
            break
        
        # Get the last n interactions from the conversation history to use as context
        context = get_context(conversation_history, n=5)

        # Input to the model
        model_input = {
            "name": "Brain",
            "context": context,
            "user_input": user_input,
        }

        # Run model and handle errors gracefully
        try:
            response = chain.invoke(model_input)
            print("\nBrain:", json.dumps(response, indent=2))

            # Append the user input and model response to the conversation history
            conversation_history.append(
                {"user_input": model_input, "model_response": response}
            )

            save_conversation_history(conversation_history)

        except OutputParserException as e:
            print("⚠️ Failed to parse JSON. Raw model response below:")
            print(e)  # Print the actual model output for debugging

def main():
    chat_bedrock = setup_llm()
    prompt_template = setup_prompt_template()
    parser = setup_parser()
    chain = setup_chain(prompt_template, chat_bedrock, parser)

    conversation_history = load_conversation_history()
    
    interactive_shell(chain, conversation_history)


if __name__ == "__main__":
    main()
def get_context(conversation_history, n=5):
    # Get the last n interactions from the conversation history
    recent_interactions = conversation_history[-n:]
    
    # Format the interactions into a string to use as context
    context = ""
    for interaction in recent_interactions:
        context += f"User: {interaction['user_input']['user_input']}\n"
        context += f"Brain: {interaction['model_response']}\n\n"
    
    return context
