import { useEffect, useState, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getAvatarSrcById, getAvatarWebpSrcById } from '../constants/gameMasterAvatars';

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
  refreshKey: number;
}

export default function ConversationSidebarIcons({
  onSelectConversation,
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

      const results = await Promise.all(
        sorted.map(async (conv) => {
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

          const mode = conv.personalityMode || '';
          if (mode === 'game_master' || mode === 'rpg_dm') {
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
          }

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
    <div className="flex w-full flex-col items-center gap-2 overflow-y-auto flex-1 min-h-0 py-1">
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
            className="h-10 w-10 rounded-lg overflow-hidden transition-all duration-200 flex items-center justify-center shrink-0 border border-brand-surface-border/40 bg-brand-surface-secondary/50"
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
  );
}
