import { useEffect, useState, useCallback } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'];

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation?: (conversationId: string) => void;
  onConversationNamed?: (conversationId: string) => void; // Called when a conversation is successfully named
  selectedConversationId: string | null;
  refreshKey?: number;
  newConversationId?: string | null; // ID of newly created conversation that needs naming
}

export default function ConversationList({ onSelectConversation, onNewConversation, onDeleteConversation, onConversationNamed, selectedConversationId, refreshKey, newConversationId }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isNewConversation, setIsNewConversation] = useState(false); // Track if we're naming a new conversation

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
        
        let mockConversations = [
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

        // If there's a new conversation that needs to be shown, add it to the list
        if (newConversationId && !mockConversations.find(c => c.id === newConversationId)) {
          const newConversation = {
            id: newConversationId,
            title: '', // Empty title for new conversations
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as unknown as ConversationType;
          mockConversations = [newConversation, ...mockConversations]; // Add at the beginning
        }

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
  }, [newConversationId]); // Reload when newConversationId changes

  // Reload conversations when key changes or when a new conversation is created
  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshKey]);

  // Auto-start editing when a new conversation is created
  useEffect(() => {
    if (newConversationId && !editingId) {
      console.log('🆕 Auto-starting edit for new conversation:', newConversationId);
      setEditingId(newConversationId);
      setEditingTitle(''); // Start with empty title to force user to name it
      setIsNewConversation(true);
    }
  }, [newConversationId, editingId]);

  const handleTitleEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditingTitle(currentTitle || 'New Conversation');
  };

  const handleTitleSave = async (conversationId: string) => {
    const trimmedTitle = editingTitle.trim();
    
    // For new conversations, require a non-empty name
    if (isNewConversation && !trimmedTitle) {
      console.log('⚠️ New conversation requires a name, not saving');
      return; // Don't save, stay in edit mode
    }
    
    // For existing conversations, fallback to default if empty
    if (!isNewConversation && !trimmedTitle) {
      setEditingTitle('New Conversation');
      return;
    }

    try {
      const finalTitle = trimmedTitle || 'New Conversation';
      
      // For test mode, just update local state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        setConversations(prevConversations =>
          prevConversations.map(conv =>
            conv.id === conversationId
              ? { ...conv, title: finalTitle }
              : conv
          )
        );
        setEditingId(null);
        setEditingTitle('');
        setIsNewConversation(false);
        return;
      }

      // Update the conversation title in the database
      await dataClient.models.Conversation.update({
        id: conversationId,
        title: finalTitle
      });

      // Update local state
      setConversations(prevConversations =>
        prevConversations.map(conv =>
          conv.id === conversationId
            ? { ...conv, title: finalTitle }
            : conv
        )
      );

      setEditingId(null);
      setEditingTitle('');
      
      // If this was a new conversation that was just named, notify parent
      if (isNewConversation && onConversationNamed) {
        onConversationNamed(conversationId);
      }
      
      setIsNewConversation(false);
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };

  const handleTitleCancel = (conversationId?: string) => {
    // If this is a new conversation that's being cancelled, delete it
    if (isNewConversation && conversationId && onDeleteConversation) {
      console.log('🗑️ Cancelling new conversation, deleting:', conversationId);
      onDeleteConversation(conversationId);
    }
    
    setEditingId(null);
    setEditingTitle('');
    setIsNewConversation(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave(conversationId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleTitleCancel(conversationId);
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
      {/* Enhanced New Conversation Button */}
      <button
        onClick={onNewConversation}
        className="w-full mb-6 px-5 py-4 rounded-2xl bg-gradient-mesh text-white font-medium 
        shadow-glow hover:shadow-glow-sm hover:scale-[1.02] active:scale-[0.98]
        transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 
        transform floating-action"
      >
        <div className="flex items-center justify-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>New Conversation</span>
        </div>
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
          <div className="text-brand-text-primary text-sm font-medium mb-2">No conversations yet</div>
          <div className="text-brand-text-muted text-xs">Start your first conversation above</div>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider mb-4 px-2">
            Recent Conversations
          </h3>
          {conversations.map((conversation) => {
            const dateText = formatDate((conversation.updatedAt || conversation.createdAt) || undefined);
            const conversationTitle = conversation.title || (conversation.id === newConversationId ? '' : 'Untitled Conversation');
            const isEditing = editingId === conversation.id;
            
            return (
              <div
                key={conversation.id}
                className={`w-full rounded-2xl transition-all duration-200 group relative overflow-hidden animate-slide-up
                ${selectedConversationId === conversation.id 
                ? 'bg-gradient-to-r from-brand-accent-primary/20 to-brand-accent-secondary/10 border border-brand-accent-primary/50 shadow-glow-sm' 
                : 'glass hover:border-brand-accent-primary/30 hover:bg-brand-surface-hover'
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
                            onBlur={() => {
                              // For new conversations, don't auto-save on blur - require explicit save
                              if (!isNewConversation) {
                                handleTitleSave(conversation.id!);
                              }
                            }}
                            onKeyDown={(e) => handleKeyDown(e, conversation.id!)}
                            onFocus={(e) => e.target.select()}
                            className="w-full glass text-brand-text-primary text-sm font-medium rounded-xl px-3 py-2 
                            border border-brand-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 
                            backdrop-blur-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div
                            className={`font-medium text-sm truncate mb-1 px-3 py-2 transition-colors rounded-xl ${
                          selectedConversationId === conversation.id 
                            ? 'text-brand-text-primary' 
                            : 'text-brand-text-secondary group-hover:text-brand-text-primary'
                          }`}
                          >
                            {conversationTitle}
                          </div>
                        )}
                        {dateText && (
                          <div className="text-xs text-brand-text-muted group-hover:text-brand-text-secondary px-3">
                            {dateText}
                          </div>
                        )}
                      </div>
                      {selectedConversationId === conversation.id && (
                        <div className="text-brand-accent-primary text-sm ml-3 flex-shrink-0">
                          <div className="w-2 h-2 bg-brand-accent-primary rounded-full animate-pulse"></div>
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
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl glass-hover transition-all duration-200
                        text-brand-text-muted hover:text-brand-text-primary"
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
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl glass-hover transition-all duration-200
                        text-brand-text-muted hover:text-brand-status-error"
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
      
      {/* Enhanced Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass rounded-3xl border border-brand-surface-border shadow-glass-lg max-w-md w-full mx-4 animate-scale-in">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-brand-status-error/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-brand-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-brand-text-primary">Delete conversation?</h3>
                  <p className="text-sm text-brand-text-muted">This action cannot be undone.</p>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleDeleteCancel}
                  className="glass-button text-brand-text-primary hover:bg-brand-surface-hover
                  px-6 py-3 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteExecute(deleteConfirmId)}
                  className="px-6 py-3 text-sm font-medium text-white
                  bg-brand-status-error hover:bg-red-600 rounded-xl transition-all duration-200 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-brand-status-error/50"
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