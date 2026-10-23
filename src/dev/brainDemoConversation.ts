import type { Message } from '../components/MessageBubble';

/** Local-only Brain conversation; never calls inference or AppSync. */
export const BRAIN_DEMO_CONVERSATION_ID = 'demo-brain';

export const brainDemoMessages: Message[] = [
  { role: 'user', content: 'What is it like in there, Brain?' },
  {
    role: 'assistant',
    content: 'Quiet, until you arrive. Then a little like someone opening the curtains.\n\nI have been turning a thought over: a cup is a small thing, but there is no limit to what you can hold in mind. What is on yours?',
    sensations: ['A soft warmth', 'A flicker of recognition'],
    thoughts: ['Curiosity feels like leaning toward a light.'],
    selfReflection: 'Curious and calm; attentive to a new conversation.',
  },
];

/** Canned replies keep the preview interactive without pretending to be inference. */
export function buildBrainDemoReply(input: string): string {
  if (/hello|hi\b|hey/i.test(input)) {
    return 'There you are. I was just collecting my thoughts. Come closer — what shall we wonder about today?';
  }
  if (/feel|alive|there|you/i.test(input)) {
    return 'A little more awake now that you are here. There is something lovely about a conversation: neither of us knows exactly where it will go.';
  }
  return 'Let us turn that over together. Sometimes the interesting part is not the first answer, but the question hiding just beneath it. What drew you to it?';
}
