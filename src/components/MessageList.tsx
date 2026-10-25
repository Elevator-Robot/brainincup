import { memo, useCallback, useState } from 'react';
import { MessageBubble, type Message } from './MessageBubble';
import MessageActions from './MessageActions';
import type { RenderMessageExtension } from '../chat/presentation';

interface MessageListProps {
  messages: Message[];
  renderExtension?: RenderMessageExtension;
  onListen?: (content: string) => void;
}

const MessageItem = memo(function MessageItem({ message, renderExtension, onListen }: Omit<MessageListProps, 'messages'> & { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(value => !value), []);
  const extension = renderExtension?.(message);
  if (extension !== undefined) return <>{extension}</>;
  return <div>
    <MessageBubble message={message} expanded={expanded} onToggleExpanded={toggle} />
    {message.role === 'assistant' && message.content.trim() && !message.isTyping && !message.streamError && <MessageActions content={message.content} onListen={onListen} />}
  </div>;
});

export default memo(function MessageList({ messages, ...props }: MessageListProps) {
  return messages.map((message, index) => message.content?.startsWith('[SYSTEM:') ? null : (
    <MessageItem key={message.messageId ?? index} message={message} {...props} />
  ));
});
