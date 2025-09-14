import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'];

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export default function ConversationList({ onSelectConversation, onNewConversation }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setIsLoading(true);
      
      // For development testing, return mock conversations
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        console.log('✅ Test mode: Loading mock conversations');
        const mockConversations = [
          {
            id: 'test-conversation-1',
            createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
          {
            id: 'test-conversation-2', 
            createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
            updatedAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          }
        ] as unknown as ConversationType[];
        setConversations(mockConversations);
        setIsLoading(false);
        return;
      }

      const { data } = await dataClient.models.Conversation.list();
      // Sort by most recent first
      const sortedConversations = (data || []).sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt || 0);
        const bDate = new Date(b.updatedAt || b.createdAt || 0);
        return bDate.getTime() - aDate.getTime();
      });
      setConversations(sortedConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-brand-text-muted">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-brand-text-primary">Conversations</h1>
        <button
          onClick={onNewConversation}
          className="px-6 py-2 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
          text-brand-text-primary shadow-sm transition-all duration-200 hover:opacity-90
          focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/20"
        >
          New Conversation
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-brand-text-muted mb-4">No conversations yet</div>
          <button
            onClick={onNewConversation}
            className="px-6 py-3 rounded-full bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary 
            text-brand-text-primary shadow-sm transition-all duration-200 hover:opacity-90
            focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/20"
          >
            Start Your First Conversation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => conversation.id && onSelectConversation(conversation.id)}
              className="w-full text-left p-4 rounded-lg bg-brand-surface-dark border border-brand-surface-border
              hover:border-brand-accent-primary/50 transition-all duration-200
              focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-brand-text-primary font-medium">
                    Conversation
                  </div>
                  <div className="text-sm text-brand-text-muted mt-1">
                    {formatDate((conversation.updatedAt || conversation.createdAt) || undefined)}
                  </div>
                </div>
                <div className="text-brand-accent-primary">
                  →
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}