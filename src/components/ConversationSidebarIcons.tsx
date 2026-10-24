import { useEffect, useState, useCallback, useRef, useId } from 'react';
import { dataClient } from '../api/dataClient';
import { getAvatarSrcById, getAvatarWebpSrcById } from '../constants/gameMasterAvatars';
import { normalizePersonalityMode } from '../constants/personalityModes';
import { pickLatestAdventure, resolveLocationName } from '../utils/gmLocations';
import { isTestModeEnabled } from '../utils/testMode';


const GM_CONVERSATION_AVATAR_STORAGE_KEY = 'gmConversationAvatarById';
const CONVERSATION_CACHE_KEY = 'conversationMetadataCache';

type ConversationMetadata = {
  id: string;
  avatarSrc: string;
  avatarSrcWebp: string;
  title: string;
  preview: string;
  updatedAt: string;
};

export const readStoredAvatarId = (conversationId: string): string => {
  if (typeof window === 'undefined' || !conversationId) return '';
  try {
    const raw = window.localStorage.getItem(GM_CONVERSATION_AVATAR_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[conversationId] ?? '';
  } catch { return ''; }
};

const readConversationCache = (): ConversationMetadata[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATION_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConversationMetadata[];
  } catch { return []; }
};

const writeConversationCache = (metadata: ConversationMetadata[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONVERSATION_CACHE_KEY, JSON.stringify(metadata));
  } catch { /* ignore */ }
};

export const CHAT_LIMIT = 3;

interface ConversationSidebarIconsProps {
  onSelectConversation: (conversationId: string) => void;
  onSelectBrain: () => void;
  onNewConversation: () => void;
  activeConversationId: string | null;
  refreshKey: number;
  isDisabled: boolean;
}

export default function ConversationSidebarIcons({
  onSelectConversation,
  onSelectBrain,
  onNewConversation,
  activeConversationId,
  refreshKey,
  isDisabled,
}: ConversationSidebarIconsProps) {
  const [icons, setIcons] = useState<Array<{ id: string; avatarSrc: string; avatarSrcWebp: string; title: string; preview: string }>>([]);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const tooltipId = useId();

  const loadIcons = useCallback(async () => {
    // Test mode has no AppSync; surface the demo adventure in the rail.
    if (isTestModeEnabled()) {
      const demo = await import('../dev/gmDemoConversation');
      const avatarId = demo.demoCharacter.avatarId ?? '';
      setIcons([{
        id: demo.DEMO_CONVERSATION_ID,
        avatarSrc: getAvatarSrcById(avatarId),
        avatarSrcWebp: getAvatarWebpSrcById(avatarId),
        title: demo.demoCharacter.name || 'Adventurer',
        preview: demo.demoAdventure.currentLocation || 'No messages yet',
      }]);
      return;
    }

    // Show cached data immediately for instant load
    const cached = readConversationCache();
    if (cached.length > 0) {
      setIcons(cached);
    }

    try {
      const { data } = await dataClient.models.Conversation.list();
      const sorted = (data || []).sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return aDate - bDate;
      });

      // Filter out Brain conversation - only show GM conversations
      const gmConversations = sorted.filter(conv => {
        const mode = normalizePersonalityMode(conv.personalityMode || 'brain');
        return mode === 'game_master';
      });

      // Fetch all data in parallel for better performance
      const results = await Promise.all(
        gmConversations.map(async (conv) => {
          if (!conv.id) return null;

          // Fetch character and latest message in parallel
          const [characterResult, messageResult] = await Promise.all([
            dataClient.models.GameMasterCharacter.list({
              filter: { conversationId: { eq: conv.id } },
              limit: 1,
              authMode: 'userPool',
            }).catch(() => null),
            dataClient.models.Message.list({
              filter: { conversationId: { eq: conv.id } },
              limit: 1,
            }).catch(() => null),
          ]);

          // Get avatar from character or stored fallback
          const character = characterResult?.data?.[0];
          const characterAvatarId = character?.avatarId ?? '';
          const resolvedAvatarId = characterAvatarId || readStoredAvatarId(conv.id);
          const avatarSrc = resolvedAvatarId ? getAvatarSrcById(resolvedAvatarId) : '';
          const avatarSrcWebp = resolvedAvatarId ? getAvatarWebpSrcById(resolvedAvatarId) : '';

          // Get preview from message or adventure location
          let preview = '';
          const latestMessage = messageResult?.data?.[0];
          if (latestMessage?.content) {
            preview = latestMessage.content;
          } else {
            // Fallback to adventure location
            try {
              const { data: adventureData } = await dataClient.models.GameMasterAdventure.list({
                filter: { conversationId: { eq: conv.id } },
              });
              const adventure = pickLatestAdventure(
                (adventureData as Array<{ currentLocation?: string; lastLocation?: string; updatedAt?: string }> | null | undefined) ?? null,
              );
              const location = resolveLocationName(adventure?.currentLocation ?? adventure?.lastLocation);
              if (location) preview = location;
            } catch { /* ignore */ }
          }

          return {
            id: conv.id,
            avatarSrc,
            avatarSrcWebp,
            title: conv.title || 'Untitled',
            preview: preview || 'No messages yet',
            updatedAt: conv.updatedAt || conv.createdAt || '',
          };
        })
      );

      const filteredResults = results.filter(Boolean) as ConversationMetadata[];
      setIcons(filteredResults);
      
      // Update cache with fresh data
      writeConversationCache(filteredResults);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadIcons();
  }, [loadIcons, refreshKey]);

  useEffect(() => () => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }, []);
  const focusTooltip = (id: string, target: HTMLElement) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = target.getBoundingClientRect();
    setTooltipPos({ x: rect.right + 16, y: rect.top + rect.height / 2 });
    setHoveredId(id);
  };

  return (
    <nav aria-label="Conversations" className="cosmic-rail-destinations flex w-full flex-col items-center flex-1 min-h-0"
      onKeyDown={event => { if (event.key === 'Escape') { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); setHoveredId(null); } }}>
      {/* Brain avatar - always at top, outside scroll area */}
      <div className="relative shrink-0 py-2">
        <button
          type="button"
          onClick={onSelectBrain}
          aria-label="Brain"
          aria-current={activeConversationId === 'brain' ? 'page' : undefined}
          aria-describedby={hoveredId === 'brain' ? tooltipId : undefined}
          onFocus={event => focusTooltip('brain', event.currentTarget)} onBlur={() => setHoveredId(null)}
          onMouseEnter={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 });
            hoverTimeoutRef.current = setTimeout(() => setHoveredId('brain'), 300);
          }}
          onMouseLeave={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setHoveredId(null);
          }}
          className={`cosmic-rail-control h-10 w-10 rounded-lg transition-all duration-200 flex items-center justify-center shrink-0 border-2 outline-none focus:outline-none ${
            activeConversationId === 'brain'
              ? 'border-brand-accent-primary/60 bg-brand-accent-primary/10 scale-95'
              : 'border-brand-surface-border/70 bg-brand-surface-elevated/40 hover:border-brand-accent-primary/60 hover:bg-brand-accent-primary/15'
          }`}
        >
          <svg className="cosmic-rail-brain-glyph" viewBox="0 0 28 28" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 6c-2-3-6-1-6 2-3-.2-5 3-3 6-2 3 0 6 3 6 0 4 6 4 6 0V6Zm0 0c2-3 6-1 6 2 3-.2 5 3 3 6 2 3 0 6-3 6 0 4-6 4-6 0" />
            <path d="M9 9c0 2 1 3 3 3m-5 4c2-1 4 0 4 2m8-9c0 2-1 3-3 3m5 4c-2-1-4 0-4 2" />
          </svg>
        </button>

        {hoveredId === 'brain' && (
          <div
            id={tooltipId} role="tooltip"
            className="fixed z-50 min-w-[180px] max-w-[220px] rounded-xl border border-brand-accent-primary/30 bg-brand-surface-elevated/95 px-3 py-2 shadow-glass-lg backdrop-blur-xl pointer-events-none"
            style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-50%)' }}
          >
            <p className="text-sm font-semibold text-brand-text-primary">Brain</p>
            <p className="text-xs text-brand-text-muted mt-0.5">Return to consciousness</p>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="cosmic-rail-divider" aria-hidden="true" />

      {/* Chat count indicator */}
      <div className="cosmic-rail-capacity" aria-label={`${icons.filter(icon => icon.avatarSrc).length} of ${CHAT_LIMIT} adventure slots used`} title="Your adventure slots">
        {Array.from({ length: CHAT_LIMIT }, (_, index) => <i key={index} data-filled={index < icons.filter(icon => icon.avatarSrc).length} aria-hidden="true" />)}
      </div>

      {/* GM conversation icons - scrollable area */}
      <div className="cosmic-conversation-list flex w-full flex-col items-center gap-2 overflow-y-auto flex-1 min-h-0 py-2">
        {icons.filter(icon => icon.avatarSrc).map((icon) => (
          <div key={icon.id} className="relative">
            <button
              type="button"
              onClick={() => onSelectConversation(icon.id)}
              aria-label={icon.title}
              aria-current={activeConversationId === icon.id ? 'page' : undefined}
              aria-describedby={hoveredId === icon.id ? tooltipId : undefined}
              onFocus={event => focusTooltip(icon.id, event.currentTarget)} onBlur={() => setHoveredId(null)}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 });
                hoverTimeoutRef.current = setTimeout(() => setHoveredId(icon.id), 300);
              }}
              onMouseLeave={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                setHoveredId(null);
              }}
              className={`cosmic-rail-control h-10 w-10 rounded-lg overflow-hidden transition-all duration-200 flex items-center justify-center shrink-0 border-2 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                activeConversationId === icon.id
                  ? 'border-brand-surface-border/40 bg-brand-surface-dark/80 scale-95'
                  : 'border-transparent bg-brand-surface-secondary/50 hover:bg-brand-surface-border/60'
              }`}
            >
              <picture>
                <source srcSet={icon.avatarSrcWebp} type="image/webp" />
                <img
                  src={icon.avatarSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-center"
                />
              </picture>
            </button>

            {hoveredId === icon.id && (
              <div
                id={tooltipId} role="tooltip"
                className="fixed z-50 min-w-[180px] max-w-[220px] rounded-xl border border-brand-surface-border/40 bg-brand-surface-elevated/95 px-3 py-2 shadow-glass-lg backdrop-blur-xl pointer-events-none"
                style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-50%)' }}
              >
                <p className="text-sm font-semibold text-brand-text-primary truncate">{icon.title}</p>
                <p className="text-xs text-brand-text-muted mt-0.5 line-clamp-2">{icon.preview}</p>
              </div>
            )}
          </div>
        ))}

        {/* New chat plus button - at bottom, only visible when under chat limit */}
        {icons.filter(icon => icon.avatarSrc).length < CHAT_LIMIT && (
          <button
            type="button"
            onClick={onNewConversation}
            onFocus={event => focusTooltip('new', event.currentTarget)} onBlur={() => setHoveredId(null)}
            disabled={isDisabled}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 });
              hoverTimeoutRef.current = setTimeout(() => setHoveredId('new'), 300);
            }}
            onMouseLeave={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              setHoveredId(null);
            }}
            className="cosmic-rail-control plus-button h-10 w-10 rounded-xl border border-brand-surface-border/50 bg-brand-surface-secondary/60 text-brand-text-primary flex items-center justify-center transition-all duration-200 hover:border-brand-surface-border/70 hover:bg-brand-surface-secondary/75 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Start new chat"
            aria-describedby={hoveredId === 'new' ? tooltipId : undefined}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="10" y1="4" x2="10" y2="16" />
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
          </button>
        )}

        {hoveredId === 'new' && (
          <div
            id={tooltipId} role="tooltip"
            className="fixed z-50 min-w-[180px] max-w-[220px] rounded-xl border border-brand-accent-primary/30 bg-brand-surface-elevated/95 px-3 py-2 shadow-glass-lg backdrop-blur-xl pointer-events-none"
            style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-50%)' }}
          >
            <p className="text-sm font-semibold text-brand-text-primary">New character</p>
            <p className="text-xs text-brand-text-muted mt-0.5">Forge a hero and begin an adventure</p>
          </div>
        )}
      </div>
    </nav>
  );
}
