import { useEffect, useState, useCallback, useMemo } from 'react';
import type React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getModeMeta, MODE_OPTIONS, normalizePersonalityMode } from '../constants/personalityModes';
import type { PersonalityModeId } from '../constants/personalityModes';
import { isNoConversationsTestMode, isTestModeEnabled } from '../utils/testMode';

const dataClient = generateClient<Schema>();

type ConversationType = Schema['Conversation']['type'] & { personalityMode?: string | null };
type MessageType = Schema['Message']['type'];

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
  disableNewConversation?: boolean;
  selectedConversationId: string | null;
  refreshKey?: number;
}

const getConversationTimestamp = (conversation: ConversationType) =>
  conversation.updatedAt || conversation.createdAt || '';

const getDateGroupLabel = (dateString?: string) => {
  if (!dateString) return 'Earlier';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - targetStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatTimestamp = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const group = getDateGroupLabel(dateString);
  if (group === 'Today') {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (group === 'Yesterday') {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function ConversationList({ onSelectConversation, onDeleteConversation, onNewConversation, disableNewConversation, selectedConversationId, refreshKey }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [modeFilter, setModeFilter] = useState<PersonalityModeId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [latestMessageByConversation, setLatestMessageByConversation] = useState<Record<string, string>>({});
  const newConversationDisabled = Boolean(disableNewConversation);

  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // For development testing, return mock conversations
      if (isTestModeEnabled()) {
        console.log('✅ Test mode: Loading mock conversations');
        
        // If noconversations=true, return empty array to test auto-creation
        if (isNoConversationsTestMode()) {
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

      const latestMessages: Record<string, string> = {};
      await Promise.all(
        sortedConversations.map(async (conversation) => {
          if (!conversation.id) return;
          try {
            const { data: messageData } = await dataClient.models.Message.list({
              filter: { conversationId: { eq: conversation.id } }
            });
            const latestMessage = (messageData || []).sort((a: MessageType, b: MessageType) => {
              const aDate = new Date(a.timestamp || a.createdAt || 0).getTime();
              const bDate = new Date(b.timestamp || b.createdAt || 0).getTime();
              return bDate - aDate;
            })[0];
            if (latestMessage?.content) {
              latestMessages[conversation.id] = latestMessage.content;
            }
          } catch (messageError) {
            console.error('Error loading conversation messages:', messageError);
          }
        })
      );
      setLatestMessageByConversation(latestMessages);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load conversations initially and when refreshKey changes
  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshKey]);

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
      if (isTestModeEnabled()) {
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


  const handleDeleteExecute = async (conversationId: string) => {
    try {
      if (onDeleteConversation) {
        await onDeleteConversation(conversationId);
        return;
      }

      // For test mode or standalone usage, fall back to client-side deletion
      if (isTestModeEnabled()) {
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

  const conversationsToShow = conversations.filter((conv) => {
    if (modeFilter && normalizePersonalityMode(conv.personalityMode) !== modeFilter) {
      return false;
    }

    if (!searchQuery.trim()) {
      return true;
    }

    const query = searchQuery.trim().toLowerCase();
    const title = (conv.title || '').toLowerCase();
    const preview = (conv.id ? latestMessageByConversation[conv.id] || '' : '').toLowerCase();
    return title.includes(query) || preview.includes(query);
  });

  const isFilteredEmpty = !!modeFilter && !isLoading && conversations.length > 0 && conversationsToShow.length === 0;

  const groupedConversations = useMemo(() => {
    const groups: Array<{ label: string; items: ConversationType[] }> = [];
    conversationsToShow.forEach((conversation) => {
      const label = getDateGroupLabel(getConversationTimestamp(conversation));
      const currentGroup = groups[groups.length - 1];
      if (!currentGroup || currentGroup.label !== label) {
        groups.push({ label, items: [conversation] });
      } else {
        currentGroup.items.push(conversation);
      }
    });
    return groups;
  }, [conversationsToShow]);

  const conversationContent = isFilteredEmpty ? (
    <div className="text-center py-10 rounded-2xl border border-dashed border-white/10 text-white/60">
      <p className="text-sm font-semibold mb-1">No interactions of this mode yet</p>
      <p className="text-xs text-white/40">Start a new interaction to spin one up.</p>
    </div>
  ) : (
    groupedConversations.map((group) => (
      <div key={group.label} className="space-y-2.5">
        <div className="flex justify-center">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-text-muted/90 backdrop-blur-lg">
            {group.label}
          </span>
        </div>
        {group.items.map((conversation) => {
          const dateText = formatTimestamp(getConversationTimestamp(conversation));
          const conversationTitle = conversation.title?.trim() || 'Untitled Interaction';
          const modeMeta = getModeMeta(conversation.personalityMode);
          const isEditing = editingId === conversation.id;
          const isSelected = selectedConversationId === conversation.id;
          const previewText = (conversation.id && latestMessageByConversation[conversation.id])
            ? latestMessageByConversation[conversation.id]
            : modeMeta.description;

          const isGameMasterConversation = modeMeta.id === 'game_master';

          return (
            <div
              key={conversation.id}
              className={`group relative w-full rounded-2xl border transition-all duration-200 backdrop-blur-xl ${
                isSelected
                  ? 'border-brand-accent-primary/45 bg-white/[0.1] shadow-[0_10px_26px_rgba(4,10,12,0.34)]'
                  : 'border-white/[0.08] bg-white/[0.04] hover:border-white/[0.16] hover:bg-white/[0.07]'
              }`}
            >
              {isEditing ? (
                <div className="px-4 py-3">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, conversation.id!)}
                    onBlur={() => handleInputBlur(conversation.id!)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Interaction name"
                    className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/40"
                    autoFocus
                  />
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  title={isSelectMode ? 'Select conversation' : 'Open interaction'}
                  onClick={() => {
                    if (!conversation.id) return;
                    if (isSelectMode) {
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
                  className="grid grid-cols-[auto,1fr,auto] items-center gap-3 px-3.5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/50 rounded-2xl"
                >
                  {isSelectMode && conversation.id && (
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
                      className="h-4 w-4 rounded border border-white/30 bg-white/5 checked:bg-brand-accent-primary checked:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/40"
                    />
                  )}

                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border ${
                    isGameMasterConversation
                      ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100'
                      : 'border-teal-300/35 bg-teal-500/10 text-teal-100'
                  }`}>
                    {isGameMasterConversation ? (
                      <img src="/game-master.svg" alt="" aria-hidden="true" className="h-3.5 w-6 object-contain" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 4a2.5 2.5 0 00-2.5 2.5v11A2.5 2.5 0 009.5 20h5a2.5 2.5 0 002.5-2.5v-11A2.5 2.5 0 0014.5 4h-5z" />
                      </svg>
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm font-semibold tracking-tight ${isSelected ? 'text-white' : 'text-brand-text-secondary group-hover:text-white'}`}>
                        {conversationTitle}
                      </p>
                      {dateText && (
                        <span className={`shrink-0 text-[11px] ${isSelected ? 'text-white/75' : 'text-brand-text-muted/75'}`}>
                          {dateText}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-brand-text-muted/80">
                      {previewText}
                    </p>
                  </div>

                  {!isSelectMode && (
                    <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (conversation.id) {
                            handleTitleEdit(conversation.id, conversationTitle);
                          }
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-brand-text-muted hover:text-brand-accent-primary hover:border-brand-accent-primary/50"
                        title="Rename interaction"
                        aria-label="Rename interaction"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (conversation.id && window.confirm('Delete this interaction?')) {
                            handleDeleteExecute(conversation.id);
                          }
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-brand-text-muted hover:text-brand-status-error hover:border-brand-status-error/50"
                        title="Delete interaction"
                        aria-label="Delete interaction"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    ))
  );

  return (
    <div className="p-3 space-y-4">
      {onNewConversation && (
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={onNewConversation}
            disabled={newConversationDisabled}
            className="inline-flex items-center rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase text-white/70 backdrop-blur-lg transition-all duration-200 hover:border-emerald-300/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-40"
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
              className="inline-flex items-center rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase text-white/70 backdrop-blur-lg transition-all duration-200 hover:border-emerald-300/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30"
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
                  className="inline-flex items-center rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase text-red-400 backdrop-blur-lg transition-all duration-200 hover:border-red-500/60 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
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
                className="inline-flex items-center rounded-xl border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold tracking-[0.18em] uppercase text-white/70 backdrop-blur-lg transition-all duration-200 hover:border-emerald-300/40 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-muted/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search interactions..."
          className="w-full rounded-full border border-white/12 bg-white/[0.05] py-2 pl-10 pr-3 text-sm text-brand-text-primary placeholder-brand-text-muted/70 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/40"
        />
      </div>

      {/* Mode Filters */}
      <div className="flex justify-center">
        <div
          className="inline-flex rounded-xl p-1 gap-px border border-white/10 bg-white/[0.03] backdrop-blur-lg"
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
                className={`relative inline-flex items-center justify-center border align-middle select-none font-sans text-xs font-semibold text-center tracking-tight px-4 py-2 duration-200 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/30 ${
                  roundedClass
                } ${
                  index < MODE_OPTIONS.length - 1 ? '-mr-px' : ''
                } after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.35)] ${
                  isActive
                    ? 'text-white bg-gradient-to-b from-emerald-500/60 to-teal-500/60 border-white/20 shadow-[0_8px_16px_rgba(4,16,14,0.35)]'
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
        <div className="flex justify-center items-center h-28">
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
          <div className="text-brand-text-muted text-xs">Use the New Interaction control to begin</div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {conversationContent}

        </div>
      )}
    </div>
  );
}
