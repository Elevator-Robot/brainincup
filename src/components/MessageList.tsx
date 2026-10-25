import { memo, useCallback, useState } from 'react';
import { MessageBubble, type Message } from './MessageBubble';
import ChatDicePrompt from './ChatDicePrompt';
import { isDiceResultPayload } from '../utils/diceRolls';
import MessageActions from './MessageActions';

interface MessageListProps {
  messages: Message[];
  isGameMasterMode: boolean;
  variant: 'desktop' | 'mobile';
  activeDiceRequestId?: string | null;
  diceDisabled?: boolean;
  onDiceRoll?: (requestId: string) => void;
  onListen?: (content: string) => void;
}

const MessageItem = memo(function MessageItem({ message, isGameMasterMode, variant, activeDiceRequestId, diceDisabled, onDiceRoll, onListen }: Omit<MessageListProps, 'messages'> & { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(value => !value), []);
  if (message.diceRoll) return isGameMasterMode ? <ChatDicePrompt roll={message.diceRoll} active={message.diceRoll.requestId === activeDiceRequestId} disabled={diceDisabled} onRoll={onDiceRoll} /> : null;
  return <div>
    <MessageBubble message={message} isGameMasterMode={isGameMasterMode} variant={variant} expanded={expanded} onToggleExpanded={toggle} />
    {message.role === 'assistant' && message.content.trim() && !message.isTyping && !message.streamError && <MessageActions content={message.content} onListen={onListen} />}
  </div>;
});

export default memo(function MessageList({ messages, ...props }: MessageListProps) {
  // Backend narration can arrive early; reveal it only after the die has landed.
  const rollingIndex = messages.findIndex(message => message.diceRoll?.phase === 'rolling');
  const visibleMessages = rollingIndex < 0 ? messages : messages.slice(0, rollingIndex + 1);
  return visibleMessages.map((message, index) => message.content?.startsWith('[SYSTEM:') || (message.role === 'user' && isDiceResultPayload(message.content)) ? null : (
    <MessageItem key={message.messageId ?? index} message={message} {...props} />
  ));
});
