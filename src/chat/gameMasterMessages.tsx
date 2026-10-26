import type { Message } from '../components/MessageBubble';
import ChatDicePrompt from '../components/ChatDicePrompt';
import { isDiceResultPayload } from '../utils/diceRolls';
import type { RenderMessageExtension } from './presentation';

/** Domain timing/filtering stays outside the shared chat components. */
export function visibleGameMasterMessages(messages: Message[]): Message[] {
  const rollingIndex = messages.findIndex(message => message.diceRoll?.phase === 'rolling');
  const revealed = rollingIndex < 0 ? messages : messages.slice(0, rollingIndex + 1);
  return revealed.filter(message => !(message.role === 'user' && isDiceResultPayload(message.content)));
}

export function gameMasterMessageExtension({ activeRequestId, disabled, onRoll }: {
  activeRequestId?: string | null; disabled?: boolean; onRoll?: (requestId: string) => void;
}): RenderMessageExtension {
  return message => message.diceRoll
    ? <ChatDicePrompt roll={message.diceRoll} active={message.diceRoll.requestId === activeRequestId} disabled={disabled} onRoll={onRoll} />
    : undefined;
}
