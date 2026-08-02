import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getAvatarSrcById, getAvatarWebpSrcById } from '../constants/gameMasterAvatars';
import { normalizePersonalityMode } from '../constants/personalityModes';
import { CHAT_LIMIT, readStoredAvatarId } from './ConversationSidebarIcons';

const dataClient = generateClient<Schema>();

const CONVERSATION_CACHE_KEY = 'conversationMetadataCache';

type ConversationMeta = {
  id: string;
  avatarSrc: string;
  avatarSrcWebp: string;
  title: string;
};

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeConversationId: string | null;
  conversationId: string | null;
  effectivePersonality: 'brain' | 'game_master';
  messagesCount: number;
  displayName: string;
  email: string;
  onSelectBrain: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onSignOut: () => void;
  onDeleteCurrent: () => void;
  onClearChat: () => void;
  onDeleteAccount: () => void;
}

const readConversationCache = (): ConversationMeta[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConversationMeta[];
    return parsed.filter(c => c && c.id);
  } catch { return []; }
};

export default function MobileMenu({
  isOpen,
  onClose,
  activeConversationId,
  conversationId,
  effectivePersonality,
  messagesCount,
  displayName,
  email,
  onSelectBrain,
  onSelectConversation,
  onNewConversation,
  onSignOut,
  onDeleteCurrent,
  onClearChat,
  onDeleteAccount,
}: MobileMenuProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setConversations(readConversationCache());
    let cancelled = false;
    (async () => {
      try {
        const { data: rows } = await dataClient.models.Conversation.list();
        const gm = (rows || [])
          .filter(c => normalizePersonalityMode(c.personalityMode || 'brain') === 'game_master')
          .sort((a, b) => new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime());

        const items: ConversationMeta[] = [];
        for (const c of gm) {
          if (!c.id) continue;
          let avatarId = '';
          try {
            const { data: chars } = await dataClient.models.GameMasterCharacter.list({
              filter: { conversationId: { eq: c.id } },
              limit: 1,
              authMode: 'userPool',
            });
            avatarId = chars?.[0]?.avatarId || '';
          } catch { /* ignore */ }
          const resolvedAvatarId = avatarId || readStoredAvatarId(c.id);
          items.push({
            id: c.id,
            avatarSrc: resolvedAvatarId ? getAvatarSrcById(resolvedAvatarId) : '',
            avatarSrcWebp: resolvedAvatarId ? getAvatarWebpSrcById(resolvedAvatarId) : '',
            title: c.title || 'Untitled',
          });
        }
        if (!cancelled) setConversations(items);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;
  const isGameMaster = effectivePersonality === 'game_master';
  const adventures = conversations.filter(c => c.avatarSrc);
  const operations =
    (active: boolean) =>
      `flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors border ${
        active ? 'bg-brand-surface-secondary/60 border-brand-accent-primary/40' : 'hover:bg-brand-surface-secondary/50 border-transparent'
      }`;

  return (
    <div className="lg:hidden fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 h-full w-[300px] max-w-[80vw] flex flex-col bg-brand-surface-elevated/95 backdrop-blur-xl border-r border-brand-surface-border/50 shadow-2xl animate-slide-in-left">
        <div className="flex items-center justify-between px-4 py-4 border-b border-brand-surface-border/50">
          <div className="flex items-center gap-2">
            <img src="/brain-icon.svg" alt="Brain" className="h-6 w-6 object-contain brightness-0 invert" />
            <span className="retro-title text-base font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-brand-text-muted hover:text-brand-text-primary transition-colors"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          <button
            type="button"
            onClick={() => { onSelectBrain(); onClose(); }}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left border transition-colors ${
              activeConversationId === 'brain'
                ? 'border-violet-400/40 bg-gradient-to-br from-violet-500/25 to-fuchsia-500/15'
                : 'border-transparent hover:bg-brand-surface-secondary/50'
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/50 overflow-hidden bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20">
              <img src="/brain-chat.svg" alt="" className="h-8 w-8 object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-brand-text-primary">Brain</span>
              <span className="block text-xs text-brand-text-muted">Agent co-pilot</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => { onNewConversation(); onClose(); }}
            className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left border border-transparent hover:bg-brand-surface-secondary/50 transition-colors"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-surface-border/50 bg-brand-surface-secondary/60">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-sm font-medium text-brand-text-primary">New chat</span>
          </button>

          <div className="my-3 h-px bg-brand-surface-border/50" />

          <div className="flex items-center justify-between px-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-brand-text-muted/60">Adventures</p>
            <p className="text-[10px] font-medium text-brand-text-muted/60">{adventures.length}/{CHAT_LIMIT} open</p>
          </div>
          <div className="mt-1 space-y-1">
            {adventures.length === 0 && (
              <p className="px-3 py-2 text-xs text-brand-text-muted/60">No adventures yet</p>
            )}
            {adventures.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => { onSelectConversation(conv.id); onClose(); }}
                className={operations(conversationId === conv.id)}
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-brand-surface-border/50">
                  <img src={conv.avatarSrc} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-brand-text-primary">{conv.title}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-brand-surface-border/50 p-2">
          <div className="mx-1 mb-1 px-1">
            <p className="truncate text-xs font-medium text-brand-text-primary">{displayName}</p>
            <p className="truncate text-[11px] text-brand-text-muted">{email}</p>
          </div>
          {isGameMaster ? (
            <button
              type="button"
              onClick={() => { onDeleteCurrent(); onClose(); }}
              disabled={!conversationId}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-text-muted hover:text-brand-status-error disabled:opacity-45"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete current chat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { onClearChat(); onClose(); }}
              disabled={!conversationId || messagesCount === 0}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-text-muted hover:text-brand-text-primary disabled:opacity-45"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear chat
            </button>
          )}
          <button
            type="button"
            onClick={() => { onSignOut(); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-text-primary"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
          <button
            type="button"
            onClick={() => { onDeleteAccount(); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-status-error"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}