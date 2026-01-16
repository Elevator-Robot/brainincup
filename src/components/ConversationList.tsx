import { useEffect, useState, useCallback, useRef } from 'react';
import type React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getModeMeta, MODE_OPTIONS, normalizePersonalityMode } from '../constants/personalityModes';
import type { PersonalityModeId } from '../constants/personalityModes';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'] & { personalityMode?: string | null };

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
  disableNewConversation?: boolean;
  selectedConversationId: string | null;
  refreshKey?: number;
}

export default function ConversationList({ onSelectConversation, onDeleteConversation, onNewConversation, disableNewConversation, selectedConversationId, refreshKey }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deleteHotId, setDeleteHotId] = useState<string | null>(null);
  const deleteHotTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [modeFilter, setModeFilter] = useState<PersonalityModeId | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const newConversationDisabled = Boolean(disableNewConversation);

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

        // If a mock conversation was recently created, surface it first
        if (typeof window !== 'undefined') {
          const storedMock = window.sessionStorage.getItem('mockNewConversation');
          if (storedMock) {
            try {
              const parsed = JSON.parse(storedMock) as ConversationType;
              if (parsed?.id && !mockConversations.find(c => c.id === parsed.id)) {
                mockConversations = [
                  {
                    ...parsed,
                    createdAt: parsed.createdAt || new Date().toISOString(),
                    updatedAt: parsed.updatedAt || new Date().toISOString(),
                  },
                  ...mockConversations
                ];
              }
            } catch (error) {
              console.warn('Failed to parse mock conversation from sessionStorage', error);
            }
          }
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
  }, []);

  // Reload conversations when key changes or when a new conversation is created
  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshKey]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteHotTimeoutRef.current) {
        clearTimeout(deleteHotTimeoutRef.current);
      }
    };
  }, []);


  const handleTitleEdit = (conversationId: string, currentTitle: string) => {
    setEditingId(conversationId);
    setEditingTitle(currentTitle || 'Untitled Interaction');
  };

  const handleTitleSave = async (conversationId: string) => {
    const trimmedTitle = editingTitle.trim();
    const existingConversation = conversations.find(conv => conv.id === conversationId);
    const fallbackTitle = existingConversation?.title?.trim() || 'Untitled Interaction';
    const finalTitle = trimmedTitle || fallbackTitle;

    try {
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
        return;
      }

      // Update the conversation title in the database when it actually changed
      if (finalTitle !== fallbackTitle) {
        await dataClient.models.Conversation.update({
          id: conversationId,
          title: finalTitle
        });
      }

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
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };

  const handleTitleCancel = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleInputBlur = (conversationId: string) => {
    if (editingId !== conversationId) return;
    void handleTitleSave(conversationId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleTitleSave(conversationId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleTitleCancel();
    }
  };

  const handleConversationKeyPress = (event: React.KeyboardEvent<HTMLDivElement>, conversationId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectConversation(conversationId);
    }
  };

  const handleDeleteClick = (conversationId: string) => {
    // First click: activate hot state
    if (deleteHotId !== conversationId) {
      setDeleteHotId(conversationId);
      
      // Clear any existing timeout
      if (deleteHotTimeoutRef.current) {
        clearTimeout(deleteHotTimeoutRef.current);
      }
      
      // Set timeout to cool down after 3 seconds
      deleteHotTimeoutRef.current = setTimeout(() => {
        setDeleteHotId(null);
      }, 3000);
    } else {
      // Second click while hot: execute delete
      handleDeleteExecute(conversationId);
    }
  };

  const handleDeleteExecute = async (conversationId: string) => {
    // Clear hot state and timeout
    setDeleteHotId(null);
    if (deleteHotTimeoutRef.current) {
      clearTimeout(deleteHotTimeoutRef.current);
    }
    try {
      if (onDeleteConversation) {
        await onDeleteConversation(conversationId);
        return;
      }

      // For test mode or standalone usage, fall back to client-side deletion
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        setConversations(prevConversations =>
          prevConversations.filter(conv => conv.id !== conversationId)
        );
        
        if (selectedConversationId === conversationId) {
          onSelectConversation('');
        }
        return;
      }

      await dataClient.models.Conversation.delete({
        id: conversationId
      });

      setConversations(prevConversations =>
        prevConversations.filter(conv => conv.id !== conversationId)
      );
      
      if (selectedConversationId === conversationId) {
        onSelectConversation('');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
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
      <p className="text-sm font-semibold mb-1">No interactions of this mode yet</p>
      <p className="text-xs text-white/40">Start a new interaction to spin one up.</p>
    </div>
  ) : (
    conversationsToShow.map((conversation) => {
      const dateText = formatDate((conversation.updatedAt || conversation.createdAt) || undefined);
      const conversationTitle = conversation.title?.trim() || 'Untitled Interaction';
      const modeMeta = getModeMeta(conversation.personalityMode);
      const isEditing = editingId === conversation.id;
      const isSelected = selectedConversationId === conversation.id;

      return (
        <div
          key={conversation.id}
          className={`group relative w-full rounded-2xl transition-all duration-300 animate-slide-up
          ${isSelected 
          ? 'bg-white/[0.08] ring-1 ring-brand-accent-primary/45 shadow-[0_25px_60px_rgba(6,4,24,0.55)]'
          : 'hover:bg-white/[0.04]'}
        `}
        >
          <span
            className={`pointer-events-none absolute left-3 top-3 bottom-3 w-1 rounded-full transition-opacity duration-300
            ${isSelected
          ? 'opacity-100 bg-gradient-to-b from-brand-accent-primary to-brand-accent-secondary'
          : 'opacity-0 group-hover:opacity-60 bg-white/30'}`}
            aria-hidden="true"
          ></span>
          {isEditing ? (
            <div className="px-5 py-4">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, conversation.id!)}
                onBlur={() => handleInputBlur(conversation.id!)}
                onFocus={(e) => e.target.select()}
                placeholder="Interaction name"
                className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/40"
                autoFocus
              />
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              title={isSelectMode ? "Select conversation" : "Click to open"}
              onClick={() => {
                if (!conversation.id) return;
                
                if (isSelectMode) {
                  // Toggle selection
                  const newSelected = new Set(selectedIds);
                  if (newSelected.has(conversation.id)) {
                    newSelected.delete(conversation.id);
                  } else {
                    newSelected.add(conversation.id);
                  }
                  setSelectedIds(newSelected);
                } else {
                  onSelectConversation(conversation.id);
                }
              }}
              onKeyDown={(event) => conversation.id && handleConversationKeyPress(event, conversation.id)}
              className="group relative w-full text-left rounded-3xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/50"
            >
              <div className="relative flex items-start gap-3 px-6 py-5">
                {/* Checkbox in select mode */}
                {isSelectMode && conversation.id && (
                  <div className="flex items-center pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(conversation.id)}
                      onChange={() => {
                        const newSelected = new Set(selectedIds);
                        if (newSelected.has(conversation.id!)) {
                          newSelected.delete(conversation.id!);
                        } else {
                          newSelected.add(conversation.id!);
                        }
                        setSelectedIds(newSelected);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 rounded border-2 border-white/30 bg-white/5 checked:bg-brand-accent-primary checked:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/50 cursor-pointer transition-all"
                    />
                  </div>
                )}
                
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start gap-3">
                    <p
                      className={`flex-1 text-sm font-semibold tracking-tight truncate ${
                        isSelected
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
                          isSelected
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
                
                {!isSelectMode && (
                  <div className="flex items-center gap-2 ml-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (conversation.id) {
                          handleTitleEdit(conversation.id, conversationTitle);
                        }
                      }}
                      className="p-2 rounded-xl border border-white/10 bg-white/5 text-brand-text-muted hover:text-brand-accent-primary hover:border-brand-accent-primary/50 transition-all duration-200 backdrop-blur-sm"
                      title="Rename interaction"
                      aria-label="Rename interaction"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (conversation.id && window.confirm('Delete this interaction?')) {
                          handleDeleteExecute(conversation.id);
                        }
                      }}
                      className="p-2 rounded-xl border border-white/10 bg-white/5 text-brand-text-muted hover:text-brand-status-error hover:border-brand-status-error/50 transition-all duration-200 backdrop-blur-sm"
                      title="Delete interaction"
                      aria-label="Delete interaction"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    })
  );

  return (
    <div className="p-6 space-y-6">
      {onNewConversation && (
        <div className="flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={onNewConversation}
            disabled={newConversationDisabled}
            className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.25em] uppercase text-white/70 backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-accent-primary/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New Interaction
          </button>
          
          {!isSelectMode ? (
            <button
              type="button"
              onClick={() => {
                setIsSelectMode(true);
                setSelectedIds(new Set());
              }}
              className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.25em] uppercase text-white/70 backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-accent-primary/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/30"
            >
              Select
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm(`Delete ${selectedIds.size} interaction${selectedIds.size > 1 ? 's' : ''}?`)) {
                      for (const id of Array.from(selectedIds)) {
                        if (onDeleteConversation) {
                          await onDeleteConversation(id);
                        }
                      }
                      setSelectedIds(new Set());
                      setIsSelectMode(false);
                      loadConversations();
                    }
                  }}
                  className="inline-flex items-center rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.25em] uppercase text-red-400 backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-red-500/60 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                >
                  Delete ({selectedIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                }}
                className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.25em] uppercase text-white/70 backdrop-blur-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-accent-primary/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/30"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode Filters */}
      <div className="flex justify-center">
        <div
          className="inline-flex rounded-2xl p-1 gap-px"
          role="group"
          aria-label="Filter interactions by mode"
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
            Loading interactions...
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
          <div className="text-brand-text-primary text-sm font-medium mb-2">No interactions yet</div>
          <div className="text-brand-text-muted text-xs">Use the New Interaction button to begin</div>
        </div>
      ) : (
        <div className="space-y-3">
          {conversationContent}

        </div>
      )}
    </div>
  );
}
