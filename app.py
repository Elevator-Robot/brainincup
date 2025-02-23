import os
import os
import json
import pickle
from langchain_aws import ChatBedrock

CONVERSATION_HISTORY_FILE = "conversation_history.pkl"

CONVERSATION_HISTORY_FILE = "conversation_history.pkl"
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.output_parsers import StructuredOutputParser, ResponseSchema
from langchain.schema import OutputParserException

# Ensure AWS credentials are set
os.environ["AWS_REGION"] = "us-east-1"

# Initialize the Bedrock LLM
chat_bedrock = ChatBedrock(
    model="amazon.nova-pro-v1:0",
)

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
    "foo": ["string1", "string2"],
    "bar": "some string"
}}
User: {user_input}
Assistant:
""",
)

# Define the expected JSON schema
response_schemas = [
    ResponseSchema(name="foo", description="a list of strings", type="List[string]"),
    ResponseSchema(name="bar", description="a string", type="string"),
]

# Initialize parser
parser = StructuredOutputParser.from_response_schemas(response_schemas)

# Chain components together
chain = prompt_template | chat_bedrock | parser

# Load conversation history from pkl file if it exists, otherwise create a new one
if os.path.exists(CONVERSATION_HISTORY_FILE):
    with open(CONVERSATION_HISTORY_FILE, "rb") as f:
        conversation_history = pickle.load(f)
else:
    conversation_history = []

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
    conversation_history.append({"user_input": user_input, "model_response": response})

    # Save the updated conversation history to the pkl file
    with open(CONVERSATION_HISTORY_FILE, "wb") as f:
        pickle.dump(conversation_history, f)

except OutputParserException as e:
    print("⚠️ Failed to parse JSON. Raw model response below:")
    print(e)  # Print the actual model output for debugging
