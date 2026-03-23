import { useEffect, useState, useCallback, useMemo } from 'react';
import type React from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getModeMeta } from '../constants/personalityModes';
import { getAvatarOptionById } from '../constants/gameMasterAvatars';
import { isNoConversationsTestMode, isTestModeEnabled } from '../utils/testMode';

const dataClient = generateClient<Schema>();
const GM_CONVERSATION_AVATAR_STORAGE_KEY = 'gmConversationAvatarById';

type ConversationType = Schema['Conversation']['type'] & { personalityMode?: string | null };
type MessageType = Schema['Message']['type'];
type CharacterType = Schema['GameMasterCharacter']['type'];

interface ConversationListProps {
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId: string | null;
  refreshKey?: number;
  activeMode?: string;
  deleteSelectionMode?: boolean;
  selectedDeleteIds?: Set<string>;
  onToggleDeleteSelection?: (conversationId: string) => void;
  onConversationDragStart?: (conversationId: string) => void;
  onConversationDragEnd?: () => void;
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

const sanitizeConversationTitle = (rawTitle?: string | null): string => {
  const withoutBlockedWords = (rawTitle ?? '')
    .replace(/\b(?:brain|quest)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return withoutBlockedWords || 'Untitled Interaction';
};

const normalizeConversationModeForFilter = (mode?: string | null): string => {
  if (!mode) return 'default';
  if (mode === 'rpg_dm') return 'game_master';
  return mode;
};

const readStoredConversationAvatarMap = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GM_CONVERSATION_AVATAR_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export default function ConversationList({
  onSelectConversation,
  selectedConversationId,
  refreshKey,
  activeMode = 'default',
  deleteSelectionMode = false,
  selectedDeleteIds,
  onToggleDeleteSelection,
  onConversationDragStart,
  onConversationDragEnd,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [latestMessageByConversation, setLatestMessageByConversation] = useState<Record<string, string>>({});
  const [avatarByConversation, setAvatarByConversation] = useState<Record<string, string>>({});
  const selectedDeleteSet = selectedDeleteIds ?? new Set<string>();

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
          setAvatarByConversation({});
          setIsLoading(false);
          return;
        }
        
        let mockConversations = [
          {
            id: 'test-conversation-1',
            title: 'My AI Discussion',
            personalityMode: 'default',
            createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
            updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
          {
            id: 'test-conversation-2', 
            title: 'Learning Session',
            personalityMode: 'game_master',
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
        setAvatarByConversation({});
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
      const gmAvatars: Record<string, string> = {};
      const storedAvatarMap = readStoredConversationAvatarMap();
      await Promise.all(
        sortedConversations.map(async (conversation) => {
          if (!conversation.id) return;
          const conversationMode = normalizeConversationModeForFilter(conversation.personalityMode);
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

          if (conversationMode !== 'game_master') return;
          try {
            let characters: CharacterType[] | undefined;
            try {
              const userPoolResult = await dataClient.models.GameMasterCharacter.list({
                filter: { conversationId: { eq: conversation.id } },
                limit: 1,
                authMode: 'userPool',
              });
              characters = userPoolResult.data as CharacterType[] | undefined;
            } catch {
              const fallbackResult = await dataClient.models.GameMasterCharacter.list({
                filter: { conversationId: { eq: conversation.id } },
                limit: 1,
              });
              characters = fallbackResult.data as CharacterType[] | undefined;
            }

            const character = characters?.[0];
            const storedAvatarId = storedAvatarMap[conversation.id];
            const avatarId = getAvatarOptionById(character?.avatarId ?? '')?.id
              ?? getAvatarOptionById(storedAvatarId ?? '')?.id
              ?? '';
            const avatarSrc = avatarId ? (getAvatarOptionById(avatarId)?.src ?? '') : '';
            if (avatarSrc) {
              gmAvatars[conversation.id] = avatarSrc;
            }
          } catch (characterError) {
            console.error('Error loading conversation character avatar:', characterError);
          }
        })
      );
      setLatestMessageByConversation(latestMessages);
      setAvatarByConversation(gmAvatars);
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

  const handleConversationKeyPress = (event: React.KeyboardEvent<HTMLDivElement>, conversationId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (deleteSelectionMode) {
        onToggleDeleteSelection?.(conversationId);
      } else {
        onSelectConversation(conversationId);
      }
    }
  };


  const conversationsToShow = conversations.filter((conv) => {
    const conversationMode = normalizeConversationModeForFilter(conv.personalityMode);
    const targetMode = normalizeConversationModeForFilter(activeMode);
    if (conversationMode !== targetMode) {
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

  const conversationContent = (
    groupedConversations.map((group) => (
      <div key={group.label} className="space-y-2.5">
        <div className="flex justify-center">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-brand-text-muted/90 backdrop-blur-lg">
            {group.label}
          </span>
        </div>
        {group.items.map((conversation) => {
          const conversationTitle = sanitizeConversationTitle(conversation.title);
          const modeMeta = getModeMeta(conversation.personalityMode);
          const isSelected = selectedConversationId === conversation.id;
          const previewText = (conversation.id && latestMessageByConversation[conversation.id])
            ? latestMessageByConversation[conversation.id]
            : modeMeta.description;

          const isGameMasterConversation = modeMeta.id === 'game_master';
          const conversationAvatar = conversation.id ? avatarByConversation[conversation.id] : undefined;
          const hasGameMasterAvatar = Boolean(conversationAvatar);
          const rowGridClass = deleteSelectionMode
            ? (isGameMasterConversation && hasGameMasterAvatar ? 'grid-cols-[auto,auto,1fr]' : 'grid-cols-[auto,1fr]')
            : (isGameMasterConversation && hasGameMasterAvatar ? 'grid-cols-[auto,1fr]' : 'grid-cols-[1fr]');

          return (
            <div
              key={conversation.id}
              className={`group relative w-full rounded-2xl border transition-all duration-200 backdrop-blur-xl ${
                isSelected
                  ? 'border-brand-accent-primary/45 bg-white/[0.1] shadow-[0_10px_26px_rgba(4,10,12,0.34)]'
                  : 'border-white/[0.08] bg-white/[0.04] hover:border-white/[0.16] hover:bg-white/[0.07]'
              } ${deleteSelectionMode ? '' : 'cursor-grab active:cursor-grabbing'}`}
              draggable={!deleteSelectionMode && Boolean(conversation.id)}
              onDragStart={(event) => {
                if (!conversation.id || deleteSelectionMode) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-conversation-id', conversation.id);
                event.dataTransfer.setData('text/plain', conversation.id);
                onConversationDragStart?.(conversation.id);
              }}
              onDragEnd={() => {
                onConversationDragEnd?.();
              }}
            >
              <div
                role="button"
                tabIndex={0}
                title={deleteSelectionMode ? 'Select interaction for deletion' : 'Open interaction'}
                onClick={() => {
                  if (!conversation.id) return;
                  if (deleteSelectionMode) {
                    onToggleDeleteSelection?.(conversation.id);
                  } else {
                    onSelectConversation(conversation.id);
                  }
                }}
                onKeyDown={(event) => conversation.id && handleConversationKeyPress(event, conversation.id)}
                className={`grid ${rowGridClass} items-center gap-3 px-3.5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent-primary/50 rounded-2xl`}
              >
                {deleteSelectionMode && conversation.id && (
                  <input
                    type="checkbox"
                    checked={selectedDeleteSet.has(conversation.id)}
                    onChange={() => {
                      onToggleDeleteSelection?.(conversation.id!);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border border-white/30 bg-white/5 checked:bg-brand-accent-primary checked:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/40"
                  />
                )}

                {isGameMasterConversation && hasGameMasterAvatar && (
                  <img
                    src={conversationAvatar}
                    alt=""
                    aria-hidden="true"
                    className="retro-interaction-avatar h-11 w-11 flex-shrink-0 rounded-xl object-cover object-center"
                  />
                )}

                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold tracking-tight ${isSelected ? 'text-white' : 'text-brand-text-secondary group-hover:text-white'}`}>
                    {conversationTitle}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-brand-text-muted/80">
                    {previewText}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ))
  );

  return (
    <div className="p-3 space-y-4">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-muted/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search..."
          aria-label="Search interactions"
          className="w-full rounded-full border border-white/12 bg-white/[0.05] py-2 pl-10 pr-3 text-sm text-brand-text-primary placeholder:text-brand-text-muted placeholder:opacity-70 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/40"
        />
      </div>

      {/* Conversations List */}
      {isLoading ? (
        <div className="flex justify-center items-center h-28">
          <div className="text-slate-400 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            Loading interactions...
          </div>
        </div>
      ) : conversationsToShow.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 mx-auto mb-4 bg-slate-800/50 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="text-brand-text-primary text-sm font-medium mb-2">No interactions yet</div>
          <div className="text-brand-text-muted text-xs">Use the sidebar to begin a new interaction</div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {conversationContent}

        </div>
      )}
    </div>
  );
}
