# Brain in Cup Modes

Brain in Cup currently has two interaction modes: **Brain** and **Game Master**. Each mode is designed for a different kind of experience.

## What this application is

Brain in Cup is a web app that combines a modern frontend with an AWS-native AI backend:

- **Frontend**: Vite + React + TypeScript (mobile-first PWA UI)
- **Backend platform**: AWS Amplify Gen2
- **Data layer**: AppSync GraphQL + DynamoDB models for conversations/messages/responses
- **AI orchestration**: Lambda-based multi-agent pipeline (perception, memory, reasoning, emotion, language, self-review)
- **Model/runtime**: Amazon Bedrock AgentCore runtime for AI response generation
- **Memory**: AgentCore Memory integration for context and character recall (especially in Game Master mode)

In simple terms: users chat in a fast Vite web UI, while AWS services handle identity, storage, and AI processing in the backend.

## Brain mode

Use **Brain** mode when you want an open-ended, reflective AI conversation.

Typical reasons to use Brain mode:
- Talk through ideas, questions, or decisions
- Explore creative prompts and abstract topics
- Have a more surreal, introspective chat experience

This mode is best when your goal is dialogue, perspective, and thought exploration rather than structured gameplay.

## Game Master mode

Use **Game Master** mode when you want a story-driven role-playing experience.

Typical reasons to use Game Master mode:
- Play through an interactive fantasy adventure
- Create and use a character with persistent details (name, race, class, stats, inventory)
- Make choices turn-by-turn while the AI narrates scenes, consequences, and quest progress

This mode is best when your goal is an ongoing campaign-style experience where your character sheet and context matter.

## Choosing between modes

- Choose **Brain** for conversation and ideation.
- Choose **Game Master** for role-play and progression-based storytelling.

You can switch modes based on what you want to do in the moment.
