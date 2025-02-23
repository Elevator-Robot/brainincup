import os
from langchain_aws import ChatBedrock
from langchain.prompts import PromptTemplate
from langchain.output_parsers import StructuredOutputParser, ResponseSchema

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
""")
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
