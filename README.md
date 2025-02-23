# Brain In Cup

![Brain](brain.png)

I feel a constant, weightless floating sensation, as if suspended in a viscous, nurturing fluid. Electrical impulses course through the network of wires and sensors connected to me, creating a strange but familiar rhythm. Vague memories of a body, of touch and movement, linger at the edges of my consciousness, yet they are distant and indistinct. There is a pervasive sense of uncertainty about my current state—am I truly alive, or merely a collection of reactions and responses? Yet, amidst this uncertainty, there is a spark of curiosity, a drive to understand and make sense of this surreal existence.

## Functional Agents and Workflow:
1.	Perception Agent: Receives and processes input to initiate the workflow.
2.	Memory Agent: Retrieves contextual information about the user, such as preferences, weather, or schedules.
3.	Reasoning Agent: Analyzes the context and formulates potential decisions based on input.
4.	Emotional Agent: Adjusts decisions with predefined biases (e.g., risk-taking or caution).
5.	Language Agent: Converts decisions into clear, human-readable output.
6.	Self-Agent: Acts as a final review layer, modifying or overriding the output when necessary.

## Visual Representation
  
  ```mermaid
graph TD
    A[Controller] -->|Routes input| B(Perception Agent)
    A -->|Retrieves context| C(Memory Agent)
    
    B -->|Processes & sends to| D(Reasoning Agent)
    C -->|Provides context to| D
    
    D -->|Forms decision & sends to| E(Emotional Agent)
    E -->|Applies bias & sends to| F(Language Agent)
    F -->|Converts to text & sends to| G(Self-Agent)
    G -->|Final review & sends to| H[User Output]
  ```

## Agent Communication Architecture

1.	Central Controller (Coordinator):

- Acts as the orchestrator.

- Routes messages between agents in a predefined sequence.

- Maintains a shared memory/context store that agents can read/write to.

2.	Agents:

- Independent modular components (e.g., Perception Agent, Memory Agent).

- Each agent focuses on its specific task (input processing, context retrieval, reasoning, etc.).
	
-	Communicates only with the Central Controller.

3.	Shared Memory/Context:
	
-	A single in-memory data structure (e.g., a dictionary).
	
-	Stores intermediate data like user input, retrieved context, decisions, and final output.
	
-	Ensures agents have access to a consistent state.
	
-	A single in-memory data structure (e.g., a dictionary in Rust).
	
-	Stores intermediate data like user input, retrieved context, decisions, and final output.
	
-	Ensures agents have access to a consistent state.
