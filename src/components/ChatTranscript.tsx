import type { Ref } from 'react';
import type { Message } from './MessageBubble';
import MessageList from './MessageList';
import ChatActivity from './ChatActivity';
import type { RenderMessageExtension } from '../chat/presentation';

interface ChatTranscriptProps {
  messages: Message[];
  conversationId?: string | null;
  waiting?: boolean;
  scrollRef?: Ref<HTMLDivElement>;
  contentRef?: Ref<HTMLDivElement>;
  onListen?: (content: string) => void;
  renderExtension?: RenderMessageExtension;
}

/** The one transcript surface for every experience and viewport. Layout and
 * themes cannot alter message behavior; adapters provide content/extensions. */
export default function ChatTranscript({ messages, conversationId, waiting = false, scrollRef, contentRef, onListen, renderExtension }: ChatTranscriptProps) {
  return <div className="cosmic-chat-viewport cosmic-chat-surface">
    <div ref={scrollRef} className="cosmic-chat-scroll cosmic-transcript-scroll flex-1 min-h-0 overflow-y-auto" aria-label="Conversation">
      <div ref={contentRef} className="cosmic-chat-content cosmic-transcript-content mx-auto max-w-4xl">
        <MessageList key={conversationId} messages={messages} onListen={onListen} renderExtension={renderExtension} />
        <ChatActivity active={waiting} />
        <div aria-hidden="true" />
      </div>
    </div>
  </div>;
}
