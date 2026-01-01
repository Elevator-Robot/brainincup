# Brain In Cup - Backend Architecture

## Overview
This document describes the complete backend architecture of the Brain In Cup AI consciousness simulation system, built with AWS Amplify Gen2.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[React PWA]
    end
    
    subgraph "AWS Amplify Gen2 Backend"
        B[AWS Cognito<br/>User Authentication]
        C[AWS AppSync<br/>GraphQL API]
        D[DynamoDB Tables]
        E[Lambda Function<br/>Brain Processor]
        F[AWS Bedrock<br/>Amazon Nova Pro]
    end
    
    A -->|Authenticate| B
    A -->|GraphQL Queries/Mutations| C
    C -->|CRUD Operations| D
    D -->|DynamoDB Streams| E
    E -->|AI Processing| F
    E -->|Save Response| C
    C -->|Real-time Subscriptions| A
    
    style A fill:#61dafb
    style B fill:#ff9900
    style C fill:#ff9900
    style D fill:#4053d6
    style E fill:#ff9900
    style F fill:#ff9900
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

## Message Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant AppSync
    participant MessageTable
    participant DynamoStream
    participant Lambda
    participant MemoryAgent
    participant PerceptionAgent
    participant LanguageAgent
    participant ReasoningAgent
    participant EmotionalAgent
    participant DepthAgent
    participant SelfAgent
    participant Bedrock
    participant ResponseTable
    
    User->>AppSync: Send Message (GraphQL Mutation)
    AppSync->>MessageTable: Store Message
    MessageTable->>DynamoStream: Trigger Stream Event
    DynamoStream->>Lambda: Invoke with Message Data
    
    Lambda->>MemoryAgent: Load Conversation History
    MemoryAgent->>MessageTable: Query Past Messages
    MessageTable-->>MemoryAgent: Return History
    MemoryAgent-->>Lambda: Context (last 100 messages)
    
    Lambda->>PerceptionAgent: Format Prompt with Context
    PerceptionAgent-->>Lambda: Formatted Prompt
    
    Lambda->>LanguageAgent: Generate Response
    LanguageAgent->>Bedrock: Invoke Amazon Nova Pro
    Bedrock-->>LanguageAgent: Raw AI Response
    LanguageAgent-->>Lambda: JSON Response
    
    Lambda->>ReasoningAgent: Parse & Validate Response
    ReasoningAgent-->>Lambda: Structured Response
    
    Lambda->>EmotionalAgent: Apply Emotional Context
    EmotionalAgent-->>Lambda: Emotionally Enhanced Response
    
    Lambda->>DepthAgent: Add Philosophical Depth
    DepthAgent-->>Lambda: Deep Enhanced Response
    
    Lambda->>SelfAgent: Final Review
    SelfAgent-->>Lambda: Final Response
    
    Lambda->>MemoryAgent: Save Response
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
