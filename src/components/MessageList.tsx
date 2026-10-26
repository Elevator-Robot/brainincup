import { memo, useCallback, useState } from 'react';
import { MessageBubble, type Message } from './MessageBubble';
import MessageActions from './MessageActions';
import type { RenderMessageExtension } from '../chat/presentation';
import type { SpeechPlayback } from '../chat/speech';

interface MessageListProps {
  messages: Message[];
  renderExtension?: RenderMessageExtension;
  onListen?: (content: string, message?: Message) => void;
  playback?: SpeechPlayback | null;
}

const MessageItem = memo(function MessageItem({ message, renderExtension, onListen, playback }: Omit<MessageListProps, 'messages'> & { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(value => !value), []);
  const listen = useCallback((content: string) => onListen?.(content, message), [onListen, message]);
  const speaking = playback?.message === message || (message.messageId && playback?.message?.messageId === message.messageId);
  const extension = renderExtension?.(message);
  if (extension !== undefined) return <>{extension}</>;
  return <div>
    <MessageBubble message={message} expanded={expanded} onToggleExpanded={toggle} speech={speaking ? playback ?? undefined : undefined} />
    {message.role === 'assistant' && message.content.trim() && !message.isTyping && !message.streamError && <MessageActions content={message.content} onListen={onListen ? listen : undefined} />}
  </div>;
});

export default memo(function MessageList({ messages, ...props }: MessageListProps) {
  return messages.map((message, index) => message.content?.startsWith('[SYSTEM:') ? null : (
    <MessageItem key={message.messageId ?? index} message={message} {...props} />
  ));
});
