# GitHub Copilot Instructions for Brain In Cup

## Project Overview
Brain In Cup is an AI consciousness simulation system built as a Progressive Web App (PWA) with AWS Amplify Gen2, featuring a multi-agent architecture that processes user input through specialized agents.

## Technology Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: AWS Amplify Gen2 with CDK constructs
- **Database**: DynamoDB with real-time subscriptions
- **AI Processing**: AWS Bedrock + Lambda (Python 3.12)
- **Authentication**: AWS Cognito User Pools
- **PWA**: Vite PWA plugin with Workbox service worker

## Code Style & Standards

### TypeScript
- Use strict typing with explicit types for all function parameters and return values
- Leverage Amplify's generated types from `ClientSchema<typeof schema>`
- Enable all strict TypeScript compiler options

### React Patterns
- Use functional components with hooks
- Implement proper error boundaries
- Use async/await patterns consistently
- Include proper loading states and error handling

### AWS Integration
- Always use the `brain` AWS profile for all operations
- Use environment variables for AWS resource names
- Implement proper IAM policies with least privilege
- Use AWS SDK v3 patterns where applicable

### Data Model
- Follow the established schema: Conversation → Message → BrainResponse
- Use proper authorization rules with owner-based access
- Include audit fields: `createdAt`, `updatedAt`, `owner`

## Agent Architecture
- Maintain separation of concerns between agents
- Follow the established workflow: Perception → Memory → Reasoning → Emotional → Language → Self-Agent
- Use shared memory/context pattern for inter-agent communication
- Implement proper error handling and fallback mechanisms

## PWA Requirements
- **Always maintain PWA standards** - ensure the app remains a proper Progressive Web App
- Keep service worker registration and updates functional
- Maintain proper web app manifest with correct icons and metadata
- Prioritize mobile responsiveness in all UI changes
- Ensure core functionality works offline where possible
- Support add-to-homescreen functionality

## Security
- Never expose sensitive data in client-side code
- Use Amplify's built-in authentication mechanisms
- Implement proper input validation and sanitization
- Follow AWS security best practices

## Code Quality
- Write minimal, focused code that directly addresses requirements
- Use ESLint with TypeScript rules
- Implement proper testing strategies for both frontend and backend
- Use meaningful commit messages following conventional commits

## File Structure
```
├── amplify/                 # AWS Amplify Gen2 backend
│   ├── auth/               # Cognito authentication
│   ├── data/               # GraphQL schema & DynamoDB
│   ├── functions/brain/    # Lambda function for AI processing
│   └── backend.ts          # Backend configuration
├── src/
│   ├── components/         # React components
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Application entry point
└── .amazonq/rules/        # Development guidelines
```

## Common Patterns
- Use Tailwind CSS for styling with consistent design system
- Implement real-time updates with GraphQL subscriptions
- Handle authentication state properly with Amplify Auth
- Use proper error handling for AWS service calls
- Maintain mobile-first responsive design