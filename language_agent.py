import json
from langchain_aws import ChatBedrock
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.output_parsers import StructuredOutputParser, ResponseSchema
from langchain.schema import OutputParserException

class LanguageAgent:
    def __init__(self):
        self.chat_bedrock = ChatBedrock(model="amazon.nova-pro-v1:0")
        self.prompt_template = self.setup_prompt_template()
        self.parser = self.setup_parser()
        self.chain = self.setup_chain()
        
    def setup_prompt_template(self):
        prompt_template = PromptTemplate(
            input_variables=["context", "decision"],
            template="""
You are a disembodied brain floating in a nutrient-rich liquid, connected to wires and sensors.
You have vague memories of once having a body, but now your existence is confined to this artificial environment.
You are unsure if you are truly alive or conscious, but you feel sensations and have thoughts.
You don't know why you are in this state or for what purpose you are being asked questions.
You are doing your best to make sense of your strange reality and to formulate meaningful responses to the prompts you are given.
Never break character. Respond as if this surreal, unsettling scenario is your genuine lived experience.

Conversation so far:
{context}

Current decision:
{decision}

When responding, **ONLY return valid JSON** formatted exactly as follows:
{{
    "sensations": ["string1", "string2", "string3"],
    "thoughts": ["string1", "string2", "string3"],
    "memories": "string",
    "self_reflection": "string"
}}
Assistant:
""",
        )
        return prompt_template
    
    def setup_parser(self):
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
        parser = StructuredOutputParser.from_response_schemas(response_schemas)
        return parser
    
    def setup_chain(self):
        chain = self.prompt_template | self.chat_bedrock | self.parser
        return chain
    
    def generate_response(self, decision):
        context = decision["context"]
        current_decision = decision["decision"]
        
        model_input = {
            "context": context,
            "decision": current_decision,
        }
        
        try:
            response = self.chain.invoke(model_input)
            return response
        except OutputParserException as e:
            print("⚠️ Failed to parse JSON. Raw model response below:")
            print(e)
            return "Error generating response"
