import { memo, useCallback, useEffect, useState } from 'react';
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

interface MessageItemProps extends Omit<MessageListProps, 'messages'> {
  message: Message;
  messageKey: string | number;
  expanded: boolean;
  onToggle: (key: string | number) => void;
}

const MessageItem = memo(function MessageItem({ message, messageKey, expanded, onToggle, renderExtension, onListen, playback }: MessageItemProps) {
  const toggle = useCallback(() => onToggle(messageKey), [messageKey, onToggle]);
  const listen = useCallback((content: string) => onListen?.(content, message), [onListen, message]);
  const speaking = playback?.message === message || (message.messageId && playback?.message?.messageId === message.messageId);
  const extension = renderExtension?.(message);
  const appended = extension && typeof extension === 'object' && 'placement' in extension ? extension : undefined;
  if (extension !== undefined && !appended) return <>{extension as React.ReactNode}</>;
  return <div>
    <MessageBubble message={message} expanded={expanded} onToggleExpanded={toggle} speech={speaking ? playback ?? undefined : undefined} />
    {message.streamError && <p role="alert" className="cosmic-message-error">{message.streamError}</p>}
    {appended?.content}
    {message.role === 'assistant' && message.content.trim() && !message.isTyping && !message.streamError && <MessageActions content={message.content} onListen={onListen ? listen : undefined} />}
  </div>;
});

export default memo(function MessageList({ messages, ...props }: MessageListProps) {
  const [expandedKey, setExpandedKey] = useState<string | number | null>(null);
  const toggle = useCallback((key: string | number) => setExpandedKey(current => current === key ? null : key), []);
  useEffect(() => {
    if (expandedKey !== null && !messages.some((message, index) => (message.messageId ?? index) === expandedKey)) {
      setExpandedKey(null);
    }
  }, [messages, expandedKey]);

  return messages.map((message, index) => {
    if (message.content?.startsWith('[SYSTEM:')) return null;
    const key = message.messageId ?? index;
    return <MessageItem key={key} messageKey={key} message={message} expanded={expandedKey === key} onToggle={toggle} {...props} />;
  });
});
