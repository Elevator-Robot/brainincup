import { useEffect, useState, useCallback } from 'react';
import type React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getModeMeta, MODE_OPTIONS, normalizePersonalityMode } from '../constants/personalityModes';
import type { PersonalityModeId } from '../constants/personalityModes';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'] & { personalityMode?: string | null };

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
  const [modeFilter, setModeFilter] = useState<PersonalityModeId | null>(null);

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
    if (newConversationId) {
      console.log('🆕 Auto-starting edit for new conversation:', newConversationId);
      // Always set editing for new conversations, regardless of current editingId
      setEditingId(newConversationId);
      setEditingTitle(''); // Start with empty title to force user to name it
      setIsNewConversation(true);
    }
  }, [newConversationId]); // Only depend on newConversationId

  // Reset isNewConversation when newConversationId is cleared (e.g., after cancellation)
  useEffect(() => {
    if (!newConversationId && isNewConversation) {
      console.log('🔄 Resetting new conversation state');
      setIsNewConversation(false);
      // Also clear editingId if it's still set
      setEditingId(null);
    }
  }, [newConversationId, isNewConversation]);

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

  const handleConversationKeyPress = (event: React.KeyboardEvent<HTMLDivElement>, conversationId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectConversation(conversationId);
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

  const conversationsToShow = modeFilter
    ? conversations.filter(
        (conv) => normalizePersonalityMode(conv.personalityMode) === modeFilter
      )
    : conversations;

  const isFilteredEmpty = !!modeFilter && !isLoading && conversations.length > 0 && conversationsToShow.length === 0;

  const conversationContent = isFilteredEmpty ? (
    <div className="text-center py-10 rounded-3xl border border-dashed border-white/10 text-white/60">
      <p className="text-sm font-semibold mb-1">No threads in this mode yet</p>
      <p className="text-xs text-white/40">Start a new conversation to spin one up.</p>
    </div>
  ) : (
    conversationsToShow.map((conversation) => {
      const dateText = formatDate((conversation.updatedAt || conversation.createdAt) || undefined);
      const conversationTitle = conversation.title || (conversation.id === newConversationId ? '' : 'Untitled Conversation');
      const modeMeta = getModeMeta(conversation.personalityMode);
      const isEditing = editingId === conversation.id;
      const isDeleting = deleteConfirmId === conversation.id;
      const hoverHueClass = 'from-brand-accent-primary/35 via-transparent to-brand-accent-secondary/40';

      return (
        <div
          key={conversation.id}
          className={`relative w-full rounded-3xl overflow-hidden border border-white/5 bg-white/5 backdrop-blur-2xl
          transition-all duration-300 animate-slide-up
          ${selectedConversationId === conversation.id 
          ? 'shadow-[0_25px_60px_rgba(99,67,255,0.45)] ring-2 ring-brand-accent-primary/40'
          : 'hover:-translate-y-1 hover:border-white/20'}
        `}
        >
          {isEditing ? (
            <div className="p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, conversation.id!)}
                  onFocus={(e) => e.target.select()}
                  placeholder={isNewConversation ? "Name your conversation..." : "Conversation name"}
                  className="flex-1 glass text-brand-text-primary text-sm font-medium rounded-xl px-4 py-3
                  border-2 border-brand-accent-primary/50 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 
                  focus:border-brand-accent-primary backdrop-blur-sm transition-all duration-200"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleTitleSave(conversation.id!)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white
                  bg-brand-accent-primary hover:bg-brand-accent-primary/90 rounded-xl 
                  transition-all duration-200 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50
                  disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isNewConversation && !editingTitle.trim()}
                >
                  {isNewConversation ? 'Create' : 'Save'}
                </button>
                <button
                  onClick={() => handleTitleCancel(conversation.id || undefined)}
                  className="px-4 py-2.5 text-sm font-medium text-brand-text-muted
                  glass-hover hover:text-brand-text-primary rounded-xl 
                  transition-all duration-200 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-brand-surface-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : isDeleting ? (
            <div className="p-4 bg-brand-status-error/10 border-2 border-brand-status-error/50">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-status-error/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-brand-text-primary mb-1">Delete this conversation?</div>
                  <div className="text-xs text-brand-text-muted">This action cannot be undone.</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDeleteExecute(conversation.id!)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white
                  bg-brand-status-error hover:bg-red-600 rounded-xl transition-all duration-200 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-brand-status-error/50"
                >
                  Delete
                </button>
                <button
                  onClick={handleDeleteCancel}
                  className="px-4 py-2.5 text-sm font-medium text-brand-text-muted
                  glass-hover hover:text-brand-text-primary rounded-xl 
                  transition-all duration-200 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-brand-surface-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => conversation.id && onSelectConversation(conversation.id)}
              onKeyDown={(event) => conversation.id && handleConversationKeyPress(event, conversation.id)}
              className="group relative w-full text-left rounded-3xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/50"
            >
              <div
                className="absolute inset-0 rounded-[inherit] border border-white/10 bg-white/5 backdrop-blur-xl"
                aria-hidden="true"
              ></div>
              <div
                className={`absolute inset-0 rounded-[inherit] bg-gradient-to-br ${hoverHueClass} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                aria-hidden="true"
              ></div>
              <div className="relative flex items-start gap-3 p-5">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start gap-3">
                    <p
                      className={`flex-1 text-sm font-semibold tracking-tight truncate ${
                        selectedConversationId === conversation.id
                          ? 'text-white'
                          : 'text-brand-text-secondary group-hover:text-white'
                      }`}
                      title={conversationTitle || undefined}
                    >
                      {conversationTitle || 'Untitled'}
                    </p>
                    {dateText && (
                      <span
                        className={`text-[10px] uppercase tracking-[0.4em] flex-shrink-0 ${
                          selectedConversationId === conversation.id
                            ? 'text-white/80'
                            : 'text-brand-text-muted group-hover:text-brand-text-secondary'
                        }`}
                      >
                        {dateText}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex-1 text-xs text-white/70 truncate">
                      {modeMeta.description}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTitleEdit(conversation.id!, conversationTitle);
                    }}
                    className="p-2 rounded-xl border border-white/10 bg-white/5 text-brand-text-muted hover:text-white hover:border-brand-accent-primary/40 transition-all duration-200 backdrop-blur-sm"
                    title="Edit conversation name"
                    aria-label="Edit conversation name"
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
                    className="p-2 rounded-xl border border-white/10 bg-white/5 text-brand-text-muted hover:text-brand-status-error hover:border-brand-status-error/50 transition-all duration-200 backdrop-blur-sm"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    })
  );

  return (
    <div className="p-6">
      {/* Streamlined New Conversation button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={onNewConversation}
          className="group relative inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-xl transition-all duration-300 hover:border-brand-accent-primary/40 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/30"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 text-base text-white/80 transition-all duration-300 group-hover:bg-brand-accent-primary/30 group-hover:text-white">
            +
          </span>
          <span className="tracking-tight">New Conversation</span>
          <span className="text-[0.55rem] uppercase tracking-[0.45em] text-white/40">Start</span>
        </button>
      </div>

      {/* Mode Filters */}
      <div className="mb-6 flex justify-center">
        <div
          className="inline-flex rounded-2xl p-1 gap-px"
          role="group"
          aria-label="Filter conversations by mode"
        >
          {MODE_OPTIONS.map((mode, index) => {
            const isActive = modeFilter === mode.id;
            const roundedClass =
              index === 0 ? 'rounded-l-2xl' : index === MODE_OPTIONS.length - 1 ? 'rounded-r-2xl' : '';

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setModeFilter((current) => (current === mode.id ? null : mode.id))}
                aria-pressed={isActive}
                className={`relative inline-flex items-center justify-center border align-middle select-none font-sans text-sm font-semibold text-center tracking-tight px-6 py-3 duration-300 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/30 ${
                  roundedClass
                } ${
                  index < MODE_OPTIONS.length - 1 ? '-mr-px' : ''
                } after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.35)] ${
                  isActive
                    ? `text-white bg-gradient-to-b ${mode.accent} border-white/20 shadow-[0_20px_45px_rgba(6,4,24,0.55)]`
                    : 'text-white/70 bg-transparent border-white/20 hover:text-white hover:border-white/50 hover:bg-white/10'
                }`}
              >
                <span>{mode.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

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
          {conversationContent}

        </div>
      )}
    </div>
  );
}