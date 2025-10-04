<Goals>
- Minimize build and test failures by providing clear project context and validated build steps
- Reduce pull request rejections by ensuring code follows established patterns and passes validation
- Allow faster task completion by minimizing exploration time with comprehensive project documentation
- Ensure PWA compliance is maintained in all changes
</Goals>

<Limitations>
- Instructions must be concise and under 2 pages
- Instructions must be broadly applicable, not task-specific
</Limitations>

<ProjectOverview>
Brain In Cup is an AI consciousness simulation system built as a Progressive Web App (PWA) with AWS Amplify Gen2. The system features a multi-agent architecture that processes user input through six specialized agents (Perception → Memory → Reasoning → Emotional → Language → Self-Agent) to simulate consciousness.

**Tech Stack:**
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Vite PWA plugin
- Backend: AWS Amplify Gen2 with CDK, DynamoDB, AWS Bedrock, Lambda (Python 3.12)
- Auth: AWS Cognito User Pools
</ProjectOverview>

<BuildInstructions>
**Setup:**
```bash
npm install
```

**Development:**
```bash
npm run dev  # Starts Vite dev server with HMR
```

**Build:**
```bash
npm run build  # Compiles TypeScript and builds production bundle
npm run type-check  # Type checking without emit
```

**Deploy Backend:**
```bash
npx ampx sandbox  # Deploys to AWS sandbox environment
```

**Critical:** Always use the `brain` AWS profile for all AWS operations. The AWS CLI and Amplify commands must be configured with this profile.

**Common Issues:**
- If build fails, ensure all AWS Amplify dependencies are up to date
- Type errors often indicate missing Amplify generated types - rebuild backend first
- PWA manifest errors require regenerating the manifest with proper icon paths
</BuildInstructions>

<ProjectLayout>
```
amplify/
├── auth/resource.ts           # Cognito authentication configuration
├── data/resource.ts           # GraphQL schema: Conversation → Message → BrainResponse
├── functions/brain/           # Lambda for AI agent processing
│   ├── handler.py            # Main handler with 6-agent workflow
│   └── resource.ts           # Lambda config with Bedrock permissions
└── backend.ts                # Main Amplify backend config

src/
├── components/               # React functional components
├── App.tsx                   # Main app with auth and routing
└── main.tsx                  # Entry point with Amplify config

.github/
└── copilot-instructions.md  # This file

public/
├── manifest.json            # PWA manifest - critical for PWA functionality
└── icons/                   # PWA icons (multiple sizes required)
```

**Architecture:**
- Data model: Use Amplify-generated types from `ClientSchema<typeof schema>`
- Authorization: Owner-based access with Cognito, all models have `owner`, `createdAt`, `updatedAt`
- Agent pipeline: Six agents process sequentially with shared context
- Real-time: GraphQL subscriptions for live updates
- Offline: Service worker caches for offline PWA functionality
</ProjectLayout>

<CodeConventions>
**TypeScript:**
- Use strict typing with explicit types for all parameters and return values
- Use Amplify generated types from schema
- Avoid `any` types
- Enable all strict compiler options

**React:**
- Use functional components with hooks only (no class components)
- Always implement error boundaries
- Use async/await patterns consistently
- Include loading states and error handling in all async operations
- Follow React 18+ patterns

**Styling:**
- Use Tailwind CSS utility classes exclusively
- Follow mobile-first responsive design
- Avoid inline styles or CSS modules

**File Naming:**
- Components: PascalCase (MessageList.tsx)
- Utils: camelCase (formatDate.ts)
- Constants: UPPER_SNAKE_CASE

**AWS Patterns:**
- Use AWS SDK v3 modular imports
- Wrap all AWS calls in try/catch with user-friendly errors
- Use environment variables for resource names (never hardcode ARNs)
- Implement least privilege IAM policies
</CodeConventions>

<PWARequirements>
**Critical:** All changes must maintain PWA compliance.

- Keep service worker registration functional in main.tsx
- Maintain valid manifest.json with all required fields and icon sizes
- Prioritize mobile responsiveness in all UI changes
- Ensure core features work offline where possible
- Test add-to-homescreen functionality after changes
- Service worker must properly cache static assets
</PWARequirements>

<SecurityRequirements>
- Never expose API keys, tokens, or credentials in client code
- Use Amplify Auth for all authentication
- Validate and sanitize all user inputs
- Use HTTPS for all API calls
- Follow AWS security best practices
- Owner-based access control on all data models
</SecurityRequirements>

<CommonPatterns>
**GraphQL Subscriptions:**
```typescript
const { data } = await client.models.Message.onCreate();
```

**Authentication:**
```typescript
import { getCurrentUser } from 'aws-amplify/auth';
```

**Error Handling:**
Always wrap AWS calls with try/catch and provide user feedback.

**Validation:**
- Run `npm run type-check` before committing
- Test authentication flows
- Verify subscriptions work
- Test on mobile viewport sizes
</CommonPatterns>

<AgentArchitecture>
The brain Lambda function processes input through six agents in sequence:
1. Perception: Interprets user input
2. Memory: Retrieves context
3. Reasoning: Logical analysis  
4. Emotional: Emotional intelligence
5. Language: Response formulation
6. Self-Agent: Maintains coherence

Maintain strict separation of concerns. Agents communicate via shared memory/context pattern. Each agent adds to the accumulated context without modifying previous agent outputs.
</AgentArchitecture>

<ValidationSteps>
Before completing any code changes:
1. Run `npm run type-check` - must pass with no errors
2. Run `npm run build` - must complete successfully
3. Test in browser with `npm run dev`
4. Verify PWA manifest loads correctly
5. Test authentication if auth-related changes
6. Check mobile responsiveness
7. Verify no AWS credentials exposed in code
</ValidationSteps>
