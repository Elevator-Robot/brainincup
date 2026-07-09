import { useEffect, useState, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getAvatarSrcById, getAvatarWebpSrcById } from '../constants/gameMasterAvatars';
import { normalizePersonalityMode } from '../constants/personalityModes';

const dataClient = generateClient<Schema>();

const GM_CONVERSATION_AVATAR_STORAGE_KEY = 'gmConversationAvatarById';

const readStoredAvatarId = (conversationId: string): string => {
  if (typeof window === 'undefined' || !conversationId) return '';
  try {
    const raw = window.localStorage.getItem(GM_CONVERSATION_AVATAR_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[conversationId] ?? '';
  } catch { return ''; }
};

interface ConversationSidebarIconsProps {
  onSelectConversation: (conversationId: string) => void;
  onSelectBrain: () => void;
  activeConversationId: string | null;
  refreshKey: number;
}

export default function ConversationSidebarIcons({
  onSelectConversation,
  onSelectBrain,
  activeConversationId,
  refreshKey,
}: ConversationSidebarIconsProps) {
  const [icons, setIcons] = useState<Array<{ id: string; avatarSrc: string; avatarSrcWebp: string; title: string; preview: string }>>([]);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const loadIcons = useCallback(async () => {
    try {
      const { data } = await dataClient.models.Conversation.list();
      const sorted = (data || []).sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bDate - aDate;
      });

      // Filter out Brain conversation - only show GM conversations
      const gmConversations = sorted.filter(conv => {
        const mode = normalizePersonalityMode(conv.personalityMode || 'brain');
        return mode === 'game_master';
      });

      const results = await Promise.all(
        gmConversations.map(async (conv) => {
          if (!conv.id) return null;
          let avatarSrc = '';
          let avatarSrcWebp = '';
          let preview = '';

          try {
            const { data: messageData } = await dataClient.models.Message.list({
              filter: { conversationId: { eq: conv.id } },
              limit: 1,
            });
            const latest = (messageData || []).sort((a, b) => {
              const aDate = new Date(a.timestamp || a.createdAt || 0).getTime();
              const bDate = new Date(b.timestamp || b.createdAt || 0).getTime();
              return bDate - aDate;
            })[0];
            if (latest?.content) {
              preview = latest.content;
            }
          } catch { /* ignore */ }

          try {
            let characters;
            try {
              const result = await dataClient.models.GameMasterCharacter.list({
                filter: { conversationId: { eq: conv.id } },
                limit: 1,
                authMode: 'userPool',
              });
              characters = result.data;
            } catch {
              const result = await dataClient.models.GameMasterCharacter.list({
                filter: { conversationId: { eq: conv.id } },
                limit: 1,
              });
              characters = result.data;
            }
            const character = characters?.[0];
            const characterAvatarId = character?.avatarId ?? '';
            const resolvedAvatarId = characterAvatarId || readStoredAvatarId(conv.id);
            avatarSrc = resolvedAvatarId ? getAvatarSrcById(resolvedAvatarId) : '';
            avatarSrcWebp = resolvedAvatarId ? getAvatarWebpSrcById(resolvedAvatarId) : '';

            if (!preview) {
              try {
                const { data: adventureData } = await dataClient.models.GameMasterAdventure.list({
                  filter: { conversationId: { eq: conv.id } },
                  limit: 1,
                });
                const location = adventureData?.[0]?.currentLocation;
                if (location) preview = location;
              } catch { /* ignore */ }
            }
          } catch { /* ignore */ }

          return {
            id: conv.id,
            avatarSrc,
            avatarSrcWebp,
            title: conv.title || 'Untitled',
            preview: preview || 'No messages yet',
          };
        })
      );

      setIcons(results.filter(Boolean) as Array<{ id: string; avatarSrc: string; avatarSrcWebp: string; title: string; preview: string }>);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadIcons();
  }, [loadIcons, refreshKey]);

  return (
    <div className="flex w-full flex-col items-center flex-1 min-h-0">
      {/* Brain avatar - always at top, outside scroll area */}
      <div className="relative shrink-0 py-2">
        <button
          type="button"
          onClick={onSelectBrain}
          onMouseEnter={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 });
            hoverTimeoutRef.current = setTimeout(() => setHoveredId('brain'), 300);
          }}
          onMouseLeave={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setHoveredId(null);
          }}
          className={`h-12 w-12 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0 border-2 ${
            activeConversationId === 'brain'
              ? 'border-brand-surface-border/80 bg-brand-surface-dark/80 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] scale-95'
              : 'border-violet-400/60 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:scale-110'
          }`}
        >
          <img
            src="/brain-icon.svg"
            alt="Brain"
            className="h-8 w-8 object-contain brightness-0 invert"
            onError={(e) => {
              // Fallback to emoji if SVG doesn't exist
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent && !parent.querySelector('.brain-fallback')) {
                const span = document.createElement('span');
                span.className = 'brain-fallback text-2xl';
                span.textContent = '🧠';
                parent.appendChild(span);
              }
            }}
          />
        </button>

        {hoveredId === 'brain' && (
          <div
            className="fixed z-50 min-w-[180px] max-w-[220px] rounded-xl border border-violet-400/40 bg-brand-surface-elevated/95 px-3 py-2 shadow-glass-lg backdrop-blur-xl pointer-events-none"
            style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-50%)' }}
          >
            <p className="text-sm font-semibold text-brand-text-primary">Brain</p>
            <p className="text-xs text-brand-text-muted mt-0.5">Return to consciousness</p>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-8 h-px bg-brand-surface-border/50 shrink-0" />

      {/* GM conversation icons - scrollable area */}
      <div className="flex w-full flex-col items-center gap-2 overflow-y-auto flex-1 min-h-0 py-2">
        {icons.map((icon) => (
        <div key={icon.id} className="relative">
          <button
            type="button"
            onClick={() => onSelectConversation(icon.id)}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltipPos({ x: rect.right + 10, y: rect.top + rect.height / 2 });
              hoverTimeoutRef.current = setTimeout(() => setHoveredId(icon.id), 300);
            }}
            onMouseLeave={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              setHoveredId(null);
            }}
            className={`h-10 w-10 rounded-lg overflow-hidden transition-all duration-200 flex items-center justify-center shrink-0 border ${
              activeConversationId === icon.id
                ? 'border-amber-400/80 shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] scale-95 bg-brand-surface-secondary/80'
                : 'border-brand-surface-border/40 bg-brand-surface-secondary/50 hover:border-brand-surface-border/60'
            }`}
          >
            {icon.avatarSrc ? (
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
            ) : (
              <span className="text-xs font-semibold text-brand-text-muted uppercase">
                {icon.title.charAt(0)}
              </span>
            )}
          </button>

          {hoveredId === icon.id && (
            <div
              className="fixed z-50 min-w-[180px] max-w-[220px] rounded-xl border border-brand-surface-border/40 bg-brand-surface-elevated/95 px-3 py-2 shadow-glass-lg backdrop-blur-xl pointer-events-none"
              style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-50%)' }}
            >
              <p className="text-sm font-semibold text-brand-text-primary truncate">{icon.title}</p>
              <p className="text-xs text-brand-text-muted mt-0.5 line-clamp-2">{icon.preview}</p>
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
