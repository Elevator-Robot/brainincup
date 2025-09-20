import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'];

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  selectedConversationId: string | null;
  refreshKey?: number;
}

export default function ConversationList({ onSelectConversation, onNewConversation, selectedConversationId, refreshKey }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (refreshKey !== undefined) {
      loadConversations();
    }
  }, [refreshKey]);

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
    if (!dateString) return null; // Return null instead of 'Unknown date'
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

  return (
    <div className="p-6">
      {/* New Conversation Button with improved styling */}
      <button
        onClick={onNewConversation}
        className="w-full mb-6 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 
        text-white font-medium shadow-lg hover:from-violet-500 hover:to-fuchsia-500 
        hover:shadow-violet-500/25 transition-all duration-200 
        focus:outline-none focus:ring-2 focus:ring-violet-500/50 transform hover:scale-105"
      >
        <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Conversation
      </button>

      {/* Conversations List */}
      {isLoading ? (
        <div className="flex justify-center items-center h-32">
          <div className="text-slate-400 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            Loading conversations...
          </div>
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-4 bg-slate-800/50 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-slate-300 text-sm font-medium mb-2">No conversations yet</div>
          <div className="text-slate-500 text-xs">Start your first conversation above</div>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
            Recent Conversations
          </h3>
          {conversations.map((conversation) => {
            const dateText = formatDate((conversation.updatedAt || conversation.createdAt) || undefined);
            return (
              <button
                key={conversation.id}
                onClick={() => conversation.id && onSelectConversation(conversation.id)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-200 group
                focus:outline-none focus:ring-2 focus:ring-violet-500/50 relative overflow-hidden
                ${selectedConversationId === conversation.id 
                ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/50 shadow-lg shadow-violet-500/10' 
                : 'bg-slate-800/30 border border-slate-700/50 hover:border-violet-500/30 hover:bg-slate-800/50'
              }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm truncate mb-1 ${
                      selectedConversationId === conversation.id 
                        ? 'text-white' 
                        : 'text-slate-200 group-hover:text-white'
                    }`}>
                      Conversation
                    </div>
                    {dateText && (
                      <div className="text-xs text-slate-400 group-hover:text-slate-300">
                        {dateText}
                      </div>
                    )}
                  </div>
                  {selectedConversationId === conversation.id && (
                    <div className="text-violet-400 text-sm ml-3 flex-shrink-0">
                      <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
                
                {/* Subtle gradient overlay for active conversation */}
                {selectedConversationId === conversation.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-fuchsia-600/5 pointer-events-none"></div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}