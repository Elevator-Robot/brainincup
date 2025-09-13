# Brain In Cup - Amazon Q Development Rules

## Project Overview
Brain In Cup is an AI consciousness simulation system built with AWS Amplify Gen2, featuring a multi-agent architecture that processes user input through specialized agents (Perception, Memory, Reasoning, Emotional, Language, and Self-Agent).

## Technology Stack Requirements

### AWS Amplify Gen2
- Use `@aws-amplify/backend` for backend definitions
- Follow Amplify Gen2 patterns with `defineBackend()`, `defineData()`, `defineAuth()`
- Use CDK constructs for advanced AWS resource configuration
- Leverage Amplify's built-in authorization patterns

### TypeScript Standards
- **Strict typing required**: Enable all strict TypeScript compiler options
- Use `strict: true` in tsconfig.json
- Define explicit types for all function parameters and return values
- Use proper interface definitions for data models
- Leverage Amplify's generated types from `ClientSchema<typeof schema>`

### Frontend Architecture
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- AWS Amplify UI React components where appropriate

### Backend Architecture
- DynamoDB with Amplify Data for GraphQL API
- Lambda functions for business logic (Python 3.12 for AI processing)
- DynamoDB Streams for event-driven processing
- AWS Bedrock integration for AI capabilities

## Data Model Patterns
- Follow the established schema: Conversation → Message → BrainResponse
- Use proper authorization rules with owner-based access
- Implement proper relationships with `hasMany`, `belongsTo`, `hasOne`
- Include audit fields: `createdAt`, `updatedAt`, `owner`

## Agent Architecture Guidelines
- Maintain separation of concerns between agents
- Use shared memory/context pattern for inter-agent communication
- Implement proper error handling and fallback mechanisms
- Follow the established workflow: Perception → Memory → Reasoning → Emotional → Language → Self-Agent

## Code Quality Standards
- Use ESLint with TypeScript rules
- Implement proper error boundaries in React
- Use async/await patterns consistently
- Implement proper loading states and error handling
- Follow React hooks best practices

## AWS Integration Patterns
- Use environment variables for AWS resource names
- Implement proper IAM policies with least privilege
- Use AWS SDK v3 patterns where applicable
- Leverage Amplify's built-in authentication and authorization

## Development Workflow
- Use `npm run dev` for local development
- Follow the established build process with TypeScript compilation
- Use proper Git workflows with meaningful commit messages
- Implement proper testing strategies for both frontend and backend

## Security Considerations
- Never expose sensitive data in client-side code
- Use Amplify's built-in authentication mechanisms
- Implement proper input validation and sanitization
- Follow AWS security best practices for Lambda and DynamoDB
