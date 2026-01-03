# Brain In Cup - Backend Architecture

## Overview
This document describes the complete backend architecture of the Brain In Cup AI consciousness simulation system, built with AWS Amplify Gen2.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend"
        UI[React UI]
    end
    
    subgraph "AWS AppSync GraphQL API"
        APPSYNC[AppSync API]
    end
    
    subgraph "DynamoDB Tables"
        CONV[Conversation Table]
        MSG[Message Table<br/>DynamoDB Stream Enabled]
        RESP[BrainResponse Table]
    end
    
    subgraph "Lambda Function - Brain"
        LAMBDA[Brain Lambda<br/>Thin Proxy Layer]
        HANDLER[DynamoDB Stream Handler]
        CONTROLLER[Controller]
        AGENTS[Agent Pipeline<br/>- Perception<br/>- Memory<br/>- Reasoning<br/>- Emotional<br/>- Language<br/>- Depth<br/>- Self]
        AGENTCORE_CLIENT[AgentCore Client<br/>boto3 wrapper]
    end
    
    subgraph "AWS Bedrock AgentCore Runtime"
        RUNTIME[AgentCore Runtime<br/>Docker Container]
        FASTAPI[FastAPI Server<br/>/invocations endpoint]
        BRAIN_AGENT[BrainAgent<br/>LLM Orchestration]
        BEDROCK_CLIENT[Bedrock Runtime Client]
    end
    
    subgraph "AWS Bedrock"
        LLM[Claude 3 Sonnet<br/>Foundation Model]
    end
    
    UI -->|GraphQL Mutation| APPSYNC
    APPSYNC -->|Write Message| MSG
    MSG -->|DynamoDB Stream Event| HANDLER
    HANDLER -->|Processes NEW/MODIFY events| CONTROLLER
    CONTROLLER -->|Orchestrates| AGENTS
    AGENTS -->|Invokes| AGENTCORE_CLIENT
    AGENTCORE_CLIENT -->|bedrock-agentcore:InvokeAgentRuntime| RUNTIME
    RUNTIME -->|POST /invocations| FASTAPI
    FASTAPI -->|Delegates| BRAIN_AGENT
    BRAIN_AGENT -->|invoke_model| BEDROCK_CLIENT
    BEDROCK_CLIENT -->|Calls Claude| LLM
    LLM -->|JSON Response| BEDROCK_CLIENT
    BEDROCK_CLIENT -->|Returns| BRAIN_AGENT
    BRAIN_AGENT -->|JSON Response| FASTAPI
    FASTAPI -->|Returns| RUNTIME
    RUNTIME -->|Returns| AGENTCORE_CLIENT
    AGENTCORE_CLIENT -->|Raw Response| AGENTS
    AGENTS -->|Final Response| CONTROLLER
    CONTROLLER -->|Saves| RESP
    RESP -->|Subscription| APPSYNC
    APPSYNC -->|Real-time Update| UI
    
    CONTROLLER -->|Read Context| CONV
    CONTROLLER -->|Read History| MSG

    classDef lambdaStyle fill:#FF9900,stroke:#232F3E,stroke-width:2px,color:#000
    classDef agentcoreStyle fill:#527FFF,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef bedrockStyle fill:#01A88D,stroke:#232F3E,stroke-width:2px,color:#fff
    classDef dynamoStyle fill:#4053D6,stroke:#232F3E,stroke-width:2px,color:#fff
    
    class LAMBDA,HANDLER,CONTROLLER,AGENTS,AGENTCORE_CLIENT lambdaStyle
    class RUNTIME,FASTAPI,BRAIN_AGENT agentcoreStyle
    class LLM,BEDROCK_CLIENT bedrockStyle
    class CONV,MSG,RESP dynamoStyle
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant CognitoUserPool
    participant GoogleOAuth
    participant FacebookOAuth
    participant Frontend
    
    User->>Frontend: Login Request
    alt Email Login
        Frontend->>CognitoUserPool: Email/Password Auth
        CognitoUserPool-->>Frontend: JWT Token
    else Google OAuth
        Frontend->>GoogleOAuth: OAuth Request
        GoogleOAuth-->>CognitoUserPool: OAuth Token
        CognitoUserPool-->>Frontend: JWT Token
    else Facebook OAuth
        Frontend->>FacebookOAuth: OAuth Request
        FacebookOAuth-->>CognitoUserPool: OAuth Token
        CognitoUserPool-->>Frontend: JWT Token
    end
    
    Frontend->>Frontend: Store JWT Token
```

## Data Model

```mermaid
erDiagram
    Conversation ||--o{ Message : contains
    Conversation ||--o{ BrainResponse : generates
    Message ||--|| BrainResponse : triggers
    
    Conversation {
        string id PK
        string title
        array participants
        date createdAt
        date updatedAt
        string owner
    }
    
    Message {
        string id PK
        string conversationId FK
        string senderId
        string content
        date timestamp
        string owner
    }
    
    BrainResponse {
        string id PK
        string conversationId FK
        string messageId FK
        string response
        array sensations
        array thoughts
        string memories
        string selfReflection
        date createdAt
        string owner
    }
```

## AWS Bedrock AgentCore Integration

### Architecture Overview

Brain in Cup uses AWS Bedrock AgentCore to offload heavy LLM processing from Lambda. This architecture separates concerns:

- **Lambda Function**: Thin proxy layer handling DynamoDB streams, agent orchestration, and response persistence
- **AgentCore Runtime**: Persistent Docker container executing LLM invocations without cold starts or timeout limits

### Lambda → AgentCore Flow

1. **Lambda receives** DynamoDB Stream event with user message
2. **Controller orchestrates** agent pipeline (Perception, Memory, etc.)
3. **LanguageAgent** delegates to AgentCoreClient
4. **AgentCoreClient** invokes `bedrock-agentcore:InvokeAgentRuntime` API
5. **AgentCore Runtime** processes via FastAPI `/invocations` endpoint
6. **BrainAgent** (inside AgentCore) calls Bedrock Runtime for Claude LLM
7. **Response flows back** through AgentCore → Lambda agent pipeline
8. **Controller saves** structured response to DynamoDB

### Why AgentCore

**Before AgentCore:**
- Lambda required heavy dependencies (LangChain, pydantic, tiktoken)
- Cold starts slowed first requests
- Memory tuning required (1024MB+ for LangChain)
- 15-minute Lambda timeout risk for complex chains

**After AgentCore:**
- Lambda stays lean (boto3 only, ~256MB)
- No cold starts for LLM logic
- No timeout concerns
- Simplified dependency management

### Key Components

**Lambda Layer (`amplify/functions/brain/layer/`):**
- Minimal dependencies: aws-lambda-powertools, pydantic, requests
- No LangChain or LLM frameworks
- Built for Amazon Linux 2

**AgentCore Runtime (`agent-runtime/`):**
- Docker container with FastAPI server
- Bedrock Runtime client for Claude invocations
- Handles prompt engineering and response parsing
- Deployed once, scales automatically

**AgentCore Client (`amplify/functions/brain/src/core/agentcore_client.py`):**
- Thin boto3 wrapper
- Invokes `bedrock-agentcore:InvokeAgentRuntime` API
- Handles tracing and error handling
- SSE stream parsing

## Message Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant AppSync
    participant MessageTable
    participant DynamoStream
    participant Lambda
    participant Controller
    participant MemoryAgent
    participant PerceptionAgent
    participant LanguageAgent
    participant AgentCoreClient
    participant AgentCore
    participant BrainAgent
    participant BedrockRuntime
    participant ReasoningAgent
    participant EmotionalAgent
    participant DepthAgent
    participant SelfAgent
    participant ResponseTable
    
    User->>AppSync: Send Message (GraphQL Mutation)
    AppSync->>MessageTable: Store Message
    MessageTable->>DynamoStream: Trigger Stream Event
    DynamoStream->>Lambda: Invoke with Message Data
    
    Lambda->>Controller: Initialize with conversation_id
    Controller->>MemoryAgent: Load Conversation History
    MemoryAgent->>MessageTable: Query Past Messages
    MessageTable-->>MemoryAgent: Return History
    MemoryAgent-->>Controller: Context (last 100 messages)
    
    Controller->>PerceptionAgent: Format Prompt with Context
    PerceptionAgent-->>Controller: Formatted Prompt
    
    Controller->>LanguageAgent: Generate Response
    LanguageAgent->>AgentCoreClient: Invoke AgentCore Runtime
    AgentCoreClient->>AgentCore: bedrock-agentcore:InvokeAgentRuntime
    AgentCore->>BrainAgent: POST /invocations
    BrainAgent->>BedrockRuntime: invoke_model (Claude)
    BedrockRuntime-->>BrainAgent: JSON Response
    BrainAgent-->>AgentCore: Structured Response
    AgentCore-->>AgentCoreClient: Return Response
    AgentCoreClient-->>LanguageAgent: Raw JSON
    LanguageAgent-->>Controller: AI Response
    
    Controller->>ReasoningAgent: Parse & Validate Response
    ReasoningAgent-->>Controller: Structured Response
    
    Controller->>EmotionalAgent: Apply Emotional Context
    EmotionalAgent-->>Controller: Emotionally Enhanced Response
    
    Controller->>DepthAgent: Add Philosophical Depth
    DepthAgent-->>Controller: Deep Enhanced Response
    
    Controller->>SelfAgent: Final Review
    SelfAgent-->>Controller: Final Response
    
    Controller->>MemoryAgent: Save Response
    MemoryAgent->>AppSync: GraphQL Mutation
    AppSync->>ResponseTable: Store BrainResponse
    ResponseTable-->>AppSync: Confirmation
    AppSync-->>User: Real-time Subscription Update
```

## Multi-Agent Processing Pipeline

```mermaid
graph LR
    A[User Input] --> B[Perception Agent]
    B -->|Formatted Prompt| C[Language Agent]
    C -->|Raw AI Response| D[Reasoning Agent]
    D -->|Parsed Structure| E[Emotional Agent]
    E -->|Emotional Context| F[Depth Agent]
    F -->|Enhanced Content| G[Self Agent]
    G -->|Final Response| H[Memory Agent]
    H -->|Saved to DB| I[User Sees Response]
    
    J[Memory Agent] -->|Context| B
    J -.->|History| B
    K[AWS Bedrock<br/>Nova Pro] -.->|AI Model| C
    
    style A fill:#90EE90
    style I fill:#90EE90
    style K fill:#FFD700
```

## Agent Responsibilities

```mermaid
mindmap
  root((Brain<br/>Controller))
    Perception Agent
      Format prompts
      Include context
      Set parameters
    Memory Agent
      Load history
      Save responses
      Retrieve context
      DynamoDB operations
      AppSync mutations
    Language Agent
      AWS Bedrock integration
      Response generation
      Error handling
      Multiple format support
    Reasoning Agent
      Parse JSON responses
      Validate structure
      Error recovery
      Structure enforcement
    Emotional Agent
      Emotional state tracking
      Tone adjustment
      Future: emotional processing
    Depth Agent
      Add philosophical depth
      Prevent repetition
      12 perspectives
      13 dimensions
      12 tones
    Self Agent
      Final review
      Quality control
      Future: self-reflection
```

## Lambda Function Architecture

```mermaid
graph TB
    subgraph "Lambda Function - Brain Processor"
        A[handler.py<br/>Entry Point]
        B[Controller<br/>Orchestrator]
        C[Config Module<br/>LLM Setup]
        
        subgraph "Agents"
            D[Perception Agent]
            E[Memory Agent]
            F[Reasoning Agent]
            G[Emotional Agent]
            H[Language Agent]
            I[Depth Agent]
            J[Self Agent]
        end
        
        K[Lambda Layer<br/>Dependencies]
    end
    
    L[DynamoDB Stream] -->|Event| A
    A --> B
    C --> B
    B --> D
    B --> E
    B --> F
    B --> G
    B --> H
    B --> I
    B --> J
    K -.->|AgentCore client<br/>boto3<br/>requests| B
    
    style A fill:#FF6B6B
    style B fill:#4ECDC4
    style K fill:#FFE66D
```

## Lambda Dependencies & Permissions

```mermaid
graph TB
    subgraph "Lambda Permissions"
        A[Brain Lambda Function]
        
        subgraph "IAM Policies"
            B[AgentCore Runtime<br/>bedrock-agentcore:InvokeAgentRuntime]
            C[DynamoDB Access<br/>Query, PutItem, etc.]
            D[AppSync Access<br/>appsync:GraphQL]
            E[DynamoDB Streams<br/>GetRecords, etc.]
        end
        
        subgraph "Environment Variables"
            F[CONVERSATION_TABLE_NAME]
            G[MESSAGE_TABLE_NAME]
            H[RESPONSE_TABLE_NAME]
            I[APPSYNC_API_URL]
            J[AWS_REGION_NAME]
            N[AGENTCORE_RUNTIME_ARN]
            O[AGENTCORE_TRACE_ENABLED]
            P[AGENTCORE_TRACE_SAMPLE_RATE]
        end
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    F -.-> A
    G -.-> A
    H -.-> A
    I -.-> A
    J -.-> A
    N -.-> A
    O -.-> A
    P -.-> A
    
    style A fill:#FF6B6B
    style B fill:#95E1D3
    style C fill:#95E1D3
    style D fill:#95E1D3
    style E fill:#95E1D3
```

## DynamoDB Streams Integration

```mermaid
graph LR
    A[Message Table] -->|Stream Enabled| B[DynamoDB Stream]
    B -->|NEW_AND_OLD_IMAGES| C[Event Source Mapping]
    C -->|Batch of Records| D[Lambda Invocation]
    
    D --> E{Event Type}
    E -->|INSERT| F[Process New Message]
    E -->|MODIFY| F
    E -->|REMOVE| G[Skip]
    
    F --> H[Extract Fields]
    H --> I[content<br/>conversationId<br/>messageId<br/>owner]
    I --> J[Controller.process_input]
    
    style A fill:#4053d6
    style B fill:#4053d6
    style D fill:#FF9900
    style J fill:#4ECDC4
```

## AI Processing Details

```mermaid
graph TB
    subgraph "Language Agent - Bedrock Integration"
        A[Formatted Prompt]
        B[ChatBedrock Client]
        C[Amazon Nova Pro<br/>v1:0]
        
        subgraph "Message Formats Tried"
            D1[Dict Messages]
            D2[HumanMessage]
            D3[Direct String]
            D4[Wrapped Messages]
        end
        
        E[Response Handler]
        F[Content Extraction]
        G[JSON Response]
    end
    
    A --> B
    B --> D1
    D1 -->|Success| E
    D1 -->|Fail| D2
    D2 -->|Success| E
    D2 -->|Fail| D3
    D3 -->|Success| E
    D3 -->|Fail| D4
    D4 --> E
    E --> F
    F --> G
    
    H[AWS Bedrock us-east-1] -.->|Model API| C
    C -.-> B
    
    style C fill:#FFD700
    style G fill:#90EE90
    style H fill:#FF9900
```

## Response Structure

```mermaid
graph TB
    A[LLM Raw Response] --> B{Parse Attempt}
    
    B -->|JSON Parse| C[Direct JSON]
    B -->|LangChain Parser| D[Structured Parser]
    B -->|Both Fail| E[Fallback Response]
    
    C --> F{Validate Structure}
    D --> F
    
    F -->|Has Required Fields| G[Valid Response]
    F -->|Missing Fields| E
    
    subgraph "Required Fields"
        H[sensations: array]
        I[thoughts: array]
        J[memories: string]
        K[self_reflection: string]
        L[response: string]
    end
    
    G --> H
    G --> I
    G --> J
    G --> K
    G --> L
    
    style G fill:#90EE90
    style E fill:#FFB6C1
```

## Depth Agent Enhancement Process

```mermaid
graph TB
    A[Response Input] --> B{Is Error Response?}
    
    B -->|Yes| C[Pass Through Unchanged]
    B -->|No| D[Select Random Elements]
    
    D --> E[12 Philosophical<br/>Perspectives]
    D --> F[13 Depth<br/>Dimensions]
    D --> G[12 Tones]
    
    E --> H[Generate Depth Layer]
    F --> H
    G --> H
    
    H --> I{Check Original Content}
    I -->|Too Much<br/>'Brain in Jar'| J[Apply Variation]
    I -->|Normal Content| K[Simple Integration]
    
    J --> L[Enhanced Response]
    K --> L
    
    L --> M[Add Metadata to<br/>self_reflection]
    
    M --> N[Final Enhanced Response]
    
    style N fill:#90EE90
    style C fill:#FFB6C1
```

## Memory Agent Operations

```mermaid
graph TB
    subgraph "Memory Agent Functions"
        A[Memory Agent]
        
        B[Load Conversation<br/>History]
        C[Retrieve Context<br/>Last N Messages]
        D[Save Response<br/>via AppSync]
        E[Get Last Message ID]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    
    B --> F[DynamoDB Query<br/>GSI: gsi-Conversation.messages]
    F --> G[Sort by Timestamp<br/>Ascending]
    
    C --> H[Take Last N Items<br/>Default: 5]
    H --> I[Format as Text<br/>User: ... Brain: ...]
    
    D --> J[GraphQL Mutation<br/>createBrainResponse]
    J --> K[SigV4 Auth]
    K --> L[POST to AppSync]
    
    E --> M[Query Conversation<br/>Get Latest Message]
    
    style A fill:#4ECDC4
    style F fill:#4053d6
    style L fill:#FF9900
```

## Backend Configuration Flow

```mermaid
graph TB
    A[backend.ts] --> B[Define Backend]
    
    B --> C[Auth Resource]
    B --> D[Data Resource]
    B --> E[Brain Function]
    
    D --> F[Enable DynamoDB<br/>Streams on Message]
    F --> G[StreamViewType:<br/>NEW_AND_OLD_IMAGES]
    
    E --> H[Add Environment<br/>Variables]
    E --> I[Add Lambda Layer<br/>Dependencies]
    E --> J[Create Event Source<br/>Mapping]
    E --> K[Add IAM Policies]
    
    J --> L[Connect to<br/>Message Stream]
    
    K --> M[Bedrock Policy]
    K --> N[DynamoDB Policy]
    K --> O[AppSync Policy]
    
    style A fill:#4ECDC4
    style G fill:#4053d6
    style I fill:#FFE66D
```

## Security & Authorization

```mermaid
graph TB
    subgraph "Authorization Model"
        A[User Authentication]
        B[JWT Token]
        C[Owner-based Access]
        
        subgraph "Data Access Rules"
            D[Conversation<br/>owner + Admins]
            E[Message<br/>owner + Admins]
            F[BrainResponse<br/>owner + read:authenticated]
        end
    end
    
    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    
    G[Cognito User Pool] --> A
    H[Google OAuth] --> G
    I[Facebook OAuth] --> G
    J[Email/Password] --> G
    
    style A fill:#95E1D3
    style B fill:#95E1D3
    style C fill:#95E1D3
```

## Complete Request-Response Cycle

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Frontend
    participant Cognito
    participant AppSync
    participant MessageTable
    participant Stream
    participant Lambda
    participant Agents
    participant Bedrock
    participant ResponseTable
    
    User->>Frontend: Type Message
    Frontend->>Cognito: Verify JWT Token
    Cognito-->>Frontend: Token Valid
    
    Frontend->>AppSync: createMessage Mutation
    AppSync->>MessageTable: Insert Message Record
    MessageTable-->>AppSync: Success
    AppSync-->>Frontend: Message Created
    
    MessageTable->>Stream: Stream Event (INSERT)
    Stream->>Lambda: Trigger Function
    
    Lambda->>Agents: Initialize Controller
    Agents->>MessageTable: Load History
    MessageTable-->>Agents: Past Messages
    
    Agents->>Agents: Process Through Pipeline<br/>(Perception → Language → etc.)
    Agents->>Bedrock: Request AI Response
    Bedrock-->>Agents: Generated Response
    
    Agents->>Agents: Parse, Enhance, Review
    Agents->>AppSync: createBrainResponse Mutation
    AppSync->>ResponseTable: Insert Response
    ResponseTable-->>AppSync: Success
    
    AppSync-->>Frontend: Subscription Update
    Frontend-->>User: Display AI Response
```

## Key Technologies Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend Framework** | AWS Amplify Gen2 | Infrastructure as Code |
| **Authentication** | AWS Cognito | User management & OAuth |
| **API Layer** | AWS AppSync | GraphQL API with real-time |
| **Database** | DynamoDB | NoSQL data storage |
| **Compute** | AWS Lambda (Python 3.12) | Serverless AI processing |
| **AI Model** | Amazon Nova Pro v1.0 | Natural language generation |
| **AI Framework** | LangChain | LLM orchestration |
| **Infrastructure** | AWS CDK | Custom resource configuration |
| **Authorization** | Cognito User Pools | JWT-based auth |

## Deployment Architecture

```mermaid
graph TB
    subgraph "Development"
        A[Local Development]
        B[npx ampx sandbox]
    end
    
    subgraph "AWS Cloud"
        C[CloudFormation Stack]
        D[Amplify Backend Resources]
        
        subgraph "Resources"
            E[Cognito User Pool]
            F[AppSync API]
            G[DynamoDB Tables x3]
            H[Lambda Function]
            I[Lambda Layer]
            J[IAM Roles & Policies]
            K[Event Source Mapping]
        end
    end
    
    A -->|Deploy| B
    B -->|Provision| C
    C --> D
    D --> E
    D --> F
    D --> G
    D --> H
    D --> I
    D --> J
    D --> K
    
    L[amplify_outputs.json] -.->|Configuration| A
    
    style C fill:#FF9900
    style D fill:#FF9900
```

## Scalability & Performance Features

- **Real-time Updates**: GraphQL subscriptions provide instant UI updates
- **Event-Driven**: DynamoDB Streams trigger Lambda asynchronously
- **Serverless**: Auto-scaling Lambda functions handle variable load
- **Stream Processing**: Batch processing of multiple messages
- **Context Caching**: Conversation history loaded once per invocation
- **Owner Isolation**: Data access limited by Cognito user identity
- **Lambda Layers**: Shared dependencies reduce cold start time

## Future Enhancements

1. **Emotional Agent**: Implement full emotional state tracking and modulation
2. **Self Agent**: Add sophisticated self-review and quality control logic
3. **Memory System**: Implement long-term memory storage and retrieval
4. **Multi-Model**: Support for multiple AI models beyond Nova Pro
5. **Caching**: Add conversation context caching for faster responses
6. **Analytics**: Track conversation patterns and user engagement
7. **A/B Testing**: Test different agent configurations and prompts

---

*Generated for Brain In Cup - AI Consciousness Simulation System*
