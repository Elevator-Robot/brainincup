import { useEffect, useState, useCallback } from 'react';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // For development testing, return mock conversations
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        console.log('✅ Test mode: Loading mock conversations');
        
        // If noconversations=true, return empty array to test auto-creation
        if (urlParams.get('noconversations') === 'true') {
          console.log('✅ Test mode: No conversations (testing auto-creation)');
          setConversations([]);
          setIsLoading(false);
          return;
        }
        
        const mockConversations = [
          {
            id: 'test-conversation-1',
            title: 'My AI Discussion',
            createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
          {
            id: 'test-conversation-2', 
            title: 'Learning Session',
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
  }, []);

  const handleTitleEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditingTitle(currentTitle || 'New Conversation');
  };

  const handleTitleSave = async (conversationId: string) => {
    if (!editingTitle.trim()) {
      setEditingTitle('New Conversation');
      return;
    }

    try {
      // For test mode, just update local state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        setConversations(prevConversations =>
          prevConversations.map(conv =>
            conv.id === conversationId
              ? { ...conv, title: editingTitle.trim() }
              : conv
          )
        );
        setEditingId(null);
        setEditingTitle('');
        return;
      }

      // Update the conversation title in the database
      await dataClient.models.Conversation.update({
        id: conversationId,
        title: editingTitle.trim()
      });

      // Update local state
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, title: editingTitle.trim() }
            : conv
        )
      );

      setEditingId(null);
      setEditingTitle('');
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };

  const handleTitleCancel = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave(conversationId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleTitleCancel();
    }
  };

  const handleDeleteConfirm = (conversationId: string) => {
    setDeleteConfirmId(conversationId);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null);
  };

  const handleDeleteExecute = async (conversationId: string) => {
    try {
      // For test mode, just update local state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        setConversations(prevConversations =>
          prevConversations.filter(conv => conv.id !== conversationId)
        );
        setDeleteConfirmId(null);
        
        // If we're deleting the currently selected conversation, clear selection
        if (selectedConversationId === conversationId) {
          onSelectConversation(''); // Clear selection
        }
        return;
      }

      // Delete the conversation from the database
      await dataClient.models.Conversation.delete({
        id: conversationId
      });

      // Update local state
      setConversations(prevConversations =>
        prevConversations.filter(conv => conv.id !== conversationId)
      );

      setDeleteConfirmId(null);
      
      // If we're deleting the currently selected conversation, clear selection
      if (selectedConversationId === conversationId) {
        onSelectConversation(''); // Clear selection
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      setDeleteConfirmId(null);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (refreshKey !== undefined) {
      loadConversations();
    }
  }, [refreshKey, loadConversations]);

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
            const conversationTitle = conversation.title || 'New Conversation';
            const isEditing = editingId === conversation.id;
            
            return (
              <div
                key={conversation.id}
                className={`w-full rounded-xl transition-all duration-200 group relative overflow-hidden
                ${selectedConversationId === conversation.id 
                ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/50 shadow-lg shadow-violet-500/10' 
                : 'bg-slate-800/30 border border-slate-700/50 hover:border-violet-500/30 hover:bg-slate-800/50'
              }`}
              >
                <div className="flex items-center p-4">
                  <button
                    onClick={() => conversation.id && onSelectConversation(conversation.id)}
                    className="flex-1 text-left min-w-0 focus:outline-none"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleTitleSave(conversation.id!)}
                            onKeyDown={(e) => handleKeyDown(e, conversation.id!)}
                            onFocus={(e) => e.target.select()}
                            className="w-full bg-slate-700/50 text-white text-sm font-medium rounded px-2 py-1 
                            border border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className={`font-medium text-sm truncate mb-1  
                            rounded px-2 py-1 transition-colors ${
                          selectedConversationId === conversation.id 
                            ? 'text-white' 
                            : 'text-slate-200 group-hover:text-white'
                          }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTitleEdit(conversation.id!, conversationTitle);
                            }}
                            title="Click to edit conversation name"

                          >
                            {conversationTitle}
                          </div>
                        )}
                        {dateText && (
                          <div className="text-xs text-slate-400 group-hover:text-slate-300 px-2">
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
                  </button>
                  
                  {/* Edit and Delete buttons - shown on hover for better UX */}
                  {!isEditing && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTitleEdit(conversation.id!, conversationTitle);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity
                        text-slate-400 hover:text-white hover:bg-slate-700/50"
                        title="Edit conversation name"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConfirm(conversation.id!);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity
                        text-slate-400 hover:text-red-400 hover:bg-slate-700/50"
                        title="Delete conversation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Subtle gradient overlay for active conversation */}
                {selectedConversationId === conversation.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-fuchsia-600/5 pointer-events-none"></div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete conversation?</h3>
                  <p className="text-sm text-slate-400">This action cannot be undone.</p>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleDeleteCancel}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white
                  bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteExecute(deleteConfirmId)}
                  className="px-4 py-2 text-sm font-medium text-white
                  bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}