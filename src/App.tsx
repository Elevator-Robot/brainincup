import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import type { Schema } from '../amplify/data/resource';
import { useQueryClient } from '@tanstack/react-query';
import { dataClient } from './api/dataClient';
import { adventureQuery, characterQuery, conversationQuery, gmKeys, questStepsQuery } from './queries/gm';
import InstallPrompt from './components/InstallPrompt';
import ConversationSidebarIcons from './components/ConversationSidebarIcons';
import InventoryManager, { type InventoryItem } from './components/InventoryManager';
// import Panel from './components/ui/Panel';
import { BottomInput } from './components/ui/RPGLayout';
import ContextWindowPanel, { type Quest } from './components/ContextWindowPanel';
import QuestLogPanel from './components/context/QuestLogPanel';
import { mapActiveQuests } from './utils/gmQuests';
import { normalizePersonalityMode } from './constants/personalityModes';
import type { PersonalityModeId } from './constants/personalityModes';
import {
  chooseAutoAvatarId,
  getAvatarOptionById,
} from './constants/gameMasterAvatars';
import { isTestModeEnabled } from './utils/testMode';
import { GM_PLACEHOLDER_LOCATION, pickLatestAdventure, resolveLocationName } from './utils/gmLocations';
import { streamAgentMessage, type AguiEvent } from './utils/aguiStream';
import type { Message } from './components/MessageBubble';
import MessageList from './components/MessageList';
import ChatComposer, { type ChatComposerHandle } from './components/ChatComposer';
import ChatWelcome from './components/ChatWelcome';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useChatScroll } from './hooks/useChatScroll';
import { useChatDiceRolls } from './hooks/useChatDiceRolls';
import type { DiceRollRequest } from './utils/diceRolls';
import DeleteAccountModal from './components/DeleteAccountModal';
import MobileMenu from './components/MobileMenu';
import OptionsMenuContent from './components/OptionsMenu';
import ChatVoiceControl from './components/ChatVoiceControl';
import { useChatVoice } from './hooks/useChatVoice';
import CharacterCreation, { type CharacterCreationInput } from './components/CharacterCreation';
import BrainPresence, { type BrainPresenceMood } from './components/BrainPresence';
import { canShowCharacterContext } from './utils/characterContext';

type AdventureRecord = Schema['GameMasterAdventure']['type'];
type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
type CharacterRecord = Schema['GameMasterCharacter']['type'];

const formatModelErrors = (errors: unknown): string => {
  if (!Array.isArray(errors)) return '';
  return errors
    .map((error) => {
      if (!error) return '';
      if (typeof error === 'string') return error;
      if (typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        return typeof message === 'string' ? message : '';
      }
      try {
        return JSON.stringify(error);
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join(' | ');
};

const GM_CONVERSATION_AVATAR_STORAGE_KEY = 'gmConversationAvatarById';
const LAST_CONVERSATION_STORAGE_KEY_PREFIX = 'lastConversationId';
const MESSAGES_CACHE_KEY_PREFIX = 'messagesCache';
const UI_MOBILE_INFO_EXPANDED_KEY = 'uiMobileInfoExpanded';
const UI_MOBILE_CHARACTER_EXPANDED_KEY = 'uiMobileCharacterExpanded';

const getLastConversationStorageKey = (mode: string): string =>
  `${LAST_CONVERSATION_STORAGE_KEY_PREFIX}:${normalizePersonalityMode(mode)}`;

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
  } catch (error) {
    console.warn('Failed to read stored Game Master conversation avatars:', error);
    return {};
  }
};

const writeStoredConversationAvatar = (conversationId: string, avatarId: string) => {
  if (typeof window === 'undefined') return;
  if (!conversationId || !avatarId) return;
  const existing = readStoredConversationAvatarMap();
  existing[conversationId] = avatarId;
  try {
    window.localStorage.setItem(GM_CONVERSATION_AVATAR_STORAGE_KEY, JSON.stringify(existing));
  } catch (error) {
    console.warn('Failed to persist Game Master conversation avatar:', error);
  }
};

const removeStoredConversationAvatar = (conversationId: string) => {
  if (typeof window === 'undefined') return;
  if (!conversationId) return;
  const existing = readStoredConversationAvatarMap();
  if (!existing[conversationId]) return;
  delete existing[conversationId];
  try {
    window.localStorage.setItem(GM_CONVERSATION_AVATAR_STORAGE_KEY, JSON.stringify(existing));
  } catch (error) {
    console.warn('Failed to remove persisted Game Master conversation avatar:', error);
  }
};

const getStoredConversationAvatarId = (conversationId?: string | null): string => {
  if (!conversationId) return '';
  return readStoredConversationAvatarMap()[conversationId] ?? '';
};

const readStoredBoolean = (key: string, fallback = false): boolean => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  if (value === null) return fallback;
  return value === 'true';
};

const writeStoredBoolean = (key: string, value: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value ? 'true' : 'false');
};

const getMessagesCacheKey = (conversationId: string): string =>
  `${MESSAGES_CACHE_KEY_PREFIX}:${conversationId}`;

// Persist the last known GM location per conversation so the badge, panels and
// previews hydrate synchronously on refresh instead of waiting for the async
// GameMasterAdventure list / observeQuery / stream snapshot.
const GM_LOCATION_CACHE_PREFIX = 'gmAuthoritativeLocation';

const getStoredGmLocation = (conversationId?: string | null): string => {
  if (typeof window === 'undefined' || !conversationId) return '';
  try {
    return window.localStorage.getItem(`${GM_LOCATION_CACHE_PREFIX}:${conversationId}`) ?? '';
  } catch {
    return '';
  }
};

const storeGmLocation = (conversationId: string | null | undefined, location: string) => {
  if (typeof window === 'undefined' || !conversationId || !location) return;
  try {
    window.localStorage.setItem(`${GM_LOCATION_CACHE_PREFIX}:${conversationId}`, location);
  } catch {
    // localStorage full or unavailable — ignore
  }
};

const loadCachedMessages = (conversationId: string): Message[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getMessagesCacheKey(conversationId));
    if (!raw) return null;
    return JSON.parse(raw) as Message[];
  } catch {
    return null;
  }
};

const saveCachedMessages = (conversationId: string, messages: Message[]) => {
  if (typeof window === 'undefined') return;
  try {
    // Strip transient streaming fields so restored messages don't re-animate.
    const toPersist = messages.map((m) => {
      const rest = { ...m };
      delete (rest as { populateOnMount?: boolean }).populateOnMount;
      return rest;
    });
    window.localStorage.setItem(getMessagesCacheKey(conversationId), JSON.stringify(toPersist));
  } catch {
    // localStorage full or unavailable — ignore
  }
};

interface HudQuestStep {
  id: string;
  summary: string;
  dangerLevel: string;
  createdAt?: string | null;
}

const summarizeText = (text: string, max = 220) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text.trim();
};

const inventoryTypes = new Set<InventoryItem['type']>(['weapon', 'armor', 'consumable', 'quest', 'currency']);

const parseInventoryItems = (rawInventory: unknown): InventoryItem[] => {
  if (!rawInventory) return [];

  let parsedValue: unknown = rawInventory;
  if (typeof rawInventory === 'string') {
    try {
      parsedValue = JSON.parse(rawInventory);
    } catch (error) {
      console.error('Failed to parse inventory:', error);
      return [];
    }
  }

  if (!Array.isArray(parsedValue)) return [];

  return parsedValue.flatMap((item): InventoryItem[] => {
    if (typeof item === 'string') {
      return [{
        id: crypto.randomUUID(),
        name: item,
        type: 'consumable',
        quantity: 1,
      }];
    }

    if (!item || typeof item !== 'object') return [];

    const candidate = item as Partial<InventoryItem>;
    if (!candidate.name || typeof candidate.name !== 'string') return [];

    const type: InventoryItem['type'] = inventoryTypes.has(candidate.type as InventoryItem['type'])
      ? (candidate.type as InventoryItem['type'])
      : 'consumable';

    return [{
      ...candidate,
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : crypto.randomUUID(),
      name: candidate.name,
      type,
      quantity: typeof candidate.quantity === 'number' && candidate.quantity > 0 ? candidate.quantity : 1,
    }];
  });
};

const inferDangerLevel = (text: string) => {
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  if (/[\b](battle|blood|demon|peril|trap|void)[\b]/.test(lowered)) return 'Severe';
  if (/[\b](shadow|storm|blade|curse|haunt)[\b]/.test(lowered)) return 'Rising';
  return 'Calm';
};

const inferToneTag = (text: string) => {
  if (!text) return 'neutral';
  const lowered = text.toLowerCase();
  if (/[\b](hope|ally|gentle|serene|calm)[\b]/.test(lowered)) return 'warm';
  if (/[\b](rage|fear|torment|dark)[\b]/.test(lowered)) return 'brooding';
  return 'curious';
};

const generateDefaultConversationTitle = (mode: PersonalityModeId) => {
  const base = mode === 'game_master' ? 'Quest' : 'Brain';
  return base;
};

const mapQuestStepsToHud = (steps: QuestStepRecord[]): HudQuestStep[] =>
  steps
    .filter((step): step is QuestStepRecord & { id: string } => Boolean(step && step.id))
    .map((step) => ({
      id: step.id!,
      summary: step.summary || summarizeText(step.narration || ''),
      dangerLevel: step.dangerLevel || inferDangerLevel(step.narration || step.summary || ''),
      createdAt: step.createdAt,
    }));

const deriveHudQuestStepsFromMessages = (messages: Message[]): HudQuestStep[] =>
  messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'assistant' && !message.isTyping && Boolean(message.content?.trim() || message.fullContent?.trim()))
    .map(({ message, index }) => {
      const content = message.fullContent || message.content;
      return {
        id: `derived-step-${index}`,
        summary: summarizeText(content),
        dangerLevel: inferDangerLevel(content),
        createdAt: null,
      };
    });

interface GameMasterHudProps {
  adventure: AdventureRecord;
  questSteps: HudQuestStep[];
  character: CharacterRecord | null;
  onUpdateInventory?: (newInventory: InventoryItem[]) => Promise<void>;
}

function GameMasterHud({ adventure, questSteps, character, onUpdateInventory }: GameMasterHudProps) {
  const latestStep = questSteps.slice(-1)[0];

  // Nothing renders until the character is real; the panel fades in with live data.
  if (!character) return null;
  
  // Use character data from database
  const characterName = character.name;
  const stats = {
    strength: character.strength,
    dexterity: character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom: character.wisdom,
    charisma: character.charisma,
  };
  
  const inventory = parseInventoryItems(character.inventory);
  
  return (
    <div className="animate-slide-up w-full space-y-6">
      {/* Quest Log Section */}
      <div className="w-full p-5 rounded-lg">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-1">Quest Log</p>
            <h3 className="text-lg font-semibold text-brand-text-primary">{adventure.title}</h3>
            <p className="text-xs text-brand-text-secondary">
              {adventure.genre} • Tone: {adventure.tone} • Difficulty: {adventure.difficulty}
            </p>
          </div>
          {latestStep && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-1">Current Beat</p>
              <p className="text-sm text-brand-text-primary line-clamp-3">
                {latestStep.summary}
              </p>
              <p className="text-[11px] text-brand-text-secondary mt-1">Danger: {latestStep.dangerLevel}</p>
            </div>
          )}
        </div>
      </div>

      {/* Divider with Glow */}
      <div className="w-full px-5">
        <div className="relative">
          <div className="h-px bg-gradient-to-r from-transparent via-brand-accent-primary to-transparent opacity-70"></div>
          <div className="absolute inset-0 h-px bg-gradient-to-r from-transparent via-brand-accent-primary to-transparent blur-sm opacity-50"></div>
        </div>
      </div>

      {/* Character Section */}
      <div className="w-full p-5 rounded-lg">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-1">Character</p>
            <h3 className="text-lg font-semibold text-brand-text-primary">{characterName}</h3>
          </div>
          
          {/* Stats */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-2">Stats</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">STR</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.strength}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">DEX</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.dexterity}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">INT</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.intelligence}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">WIS</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.wisdom}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">CON</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.constitution}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-brand-text-secondary">CHA</div>
                <div className="text-sm font-semibold text-brand-text-primary">{stats.charisma}</div>
              </div>
            </div>
          </div>

          {/* Inventory */}
          {onUpdateInventory ? (
            <InventoryManager 
              inventory={inventory}
              onUpdateInventory={onUpdateInventory}
              isUpdating={false}
            />
          ) : (
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-2">Inventory</p>
              <div className="space-y-1">
                {inventory.map((item) => (
                  <div key={item.id} className="text-xs text-brand-text-secondary">• {item.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface AppRouteProps {
  /** Conversation encoded in the URL. `null` means a fresh, unsaved interaction. */
  routeConversationId?: string | null;
  routeMode?: PersonalityModeId;
  onRouteChange?: (route: { conversationId: string | null; mode: PersonalityModeId }) => void;
}

function App({ routeConversationId, routeMode, onRouteChange }: AppRouteProps = {}) {
  const queryClient = useQueryClient();
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const draft = useRef('');
  const composerRef = useRef<ChatComposerHandle>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  // The route owns the conversation when it is present; localStorage is the
  // fallback for direct renders (tests, previews) and legacy links.
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (routeConversationId !== undefined) return routeConversationId;
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('lastActiveConversationId');
  });
  const chatVoice = useChatVoice(conversationId, messages);
  const [storedPersonalityMode, setStoredPersonalityMode] = useState<'brain' | 'game_master'>(() => {
    if (routeMode) return routeMode;
    if (typeof window === 'undefined') return 'game_master';
    return (localStorage.getItem('lastPersonalityMode') as 'brain' | 'game_master') || 'game_master';
  });
  const [brainConversationId, setBrainConversationId] = useState<string | null>(null);
  const conversationIntentRef = useRef(0);

  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(() =>
    readStoredBoolean(UI_MOBILE_INFO_EXPANDED_KEY, false)
  );
  const [mobileCharSheetExpanded, setMobileCharSheetExpanded] = useState(() =>
    readStoredBoolean(UI_MOBILE_CHARACTER_EXPANDED_KEY, false)
  );
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [conversationListRefreshKey, setConversationListRefreshKey] = useState(0);
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const [isNewInteractionPrimed, setIsNewInteractionPrimed] = useState(false);
  const [pendingCharacterDraft, setPendingCharacterDraft] = useState<CharacterCreationInput | null>(null);

  // PlayerState — authoritative game state synced via AppSync subscription
  type PlayerStateRecord = Schema['PlayerState']['type'];
  const [playerState, setPlayerState] = useState<PlayerStateRecord | null>(null);
  // Optimistic snapshot: last confirmed state used for rollback
  const confirmedPlayerStateRef = useRef<PlayerStateRecord | null>(null);
  const optimisticRollbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Error toast state for optimistic rollback notifications
  const [playerStateError, setPlayerStateError] = useState<string | null>(null);
  const [brainClearError, setBrainClearError] = useState<string | null>(null);
  
  // Game Master data state
  const [adventureState, setAdventureState] = useState<AdventureRecord | null>(null);
  // Placeholder-proof source of truth for the location badge. observeQuery can
  // publish pages that only contain stub/legacy placeholder rows, which would
  // erase a real location from adventureState; this state can only ever be set
  // to a resolved, non-placeholder location name so the UI never flickers.
  const [authoritativeLocation, setAuthoritativeLocation] = useState<string>(() =>
    getStoredGmLocation(conversationId)
  );
  const commitLocation = useCallback((value: string | null | undefined, forConversation?: string | null) => {
    const resolved = resolveLocationName(value);
    const targetConversation = forConversation ?? conversationId;
    if (resolved && resolved !== GM_PLACEHOLDER_LOCATION) {
      setAuthoritativeLocation(resolved);
      storeGmLocation(targetConversation, resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
  const [questSteps, setQuestSteps] = useState<QuestStepRecord[]>([]);
  const [questContext, setQuestContext] = useState<{ conversationId: string; quests: Quest[] } | null>(null);
  const activeQuests = questContext?.conversationId === conversationId ? questContext.quests : [];
  const [characterState, setCharacterState] = useState<CharacterRecord | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false);
  const [isLoadingAdventure, setIsLoadingAdventure] = useState(false);
  const [isSelectingConversation, setIsSelectingConversation] = useState(true);
  const [showCharacterCreation, setShowCharacterCreation] = useState(routeMode === 'game_master' && routeConversationId === null);
  const characterCreationLock = useRef(false);
  const adventureFetchLock = useRef<string | null>(null);
  
  // Helper to get character display data — returns null when no character exists
  const getCharacterData = useCallback(() => {
    if (!characterState) return null;
    
    const stats = {
      strength: characterState.strength ?? 10,
      dexterity: characterState.dexterity ?? 10,
      constitution: characterState.constitution ?? 10,
      intelligence: characterState.intelligence ?? 10,
      wisdom: characterState.wisdom ?? 10,
      charisma: characterState.charisma ?? 10,
    };
    
    const hp = {
      current: characterState.currentHP ?? 0,
      max: characterState.maxHP ?? 0,
      percentage: characterState.maxHP ? ((characterState.currentHP ?? 0) / characterState.maxHP) * 100 : 0,
    };
    
    const inventory = parseInventoryItems(characterState.inventory);
    // While switching conversations the previous character stays mounted (stale-while-revalidate).
    // Only fall back to the current conversation's stored avatar when the character
    // actually belongs to it, so a stale sheet can't flash the wrong avatar.
    const belongsToConversation = !conversationId || !characterState.conversationId || characterState.conversationId === conversationId;
    const avatarId = getAvatarOptionById(characterState.avatarId ?? '')?.id
      ?? (belongsToConversation ? getAvatarOptionById(getStoredConversationAvatarId(conversationId))?.id : undefined)
      ?? '';
    const avatarOption = avatarId ? getAvatarOptionById(avatarId) : undefined;
    const avatarSrc = avatarOption?.src ?? '';
    const avatarSrcWebp = avatarOption?.srcWebp ?? '';
    const avatarSrcThumbnail = avatarOption?.srcThumbnail ?? '';
    const avatarSrcMedium = avatarOption?.srcMedium ?? '';
    
    return {
      name: characterState.name ?? '',
      race: characterState.race ?? '',
      characterClass: characterState.characterClass ?? '',
      level: characterState.level ?? 1,
      avatarId,
      avatarSrc,
      avatarSrcWebp,
      avatarSrcThumbnail,
      avatarSrcMedium,
      stats,
      hp,
      inventory,
    };
  }, [characterState, conversationId]);
  
  // Determine current mode based on active conversation
  // Use stored mode on initial load, then sync with actual conversation state
  const effectivePersonality: PersonalityModeId = useMemo(() => {
    // A fresh /brain/new landing is Brain while its account-scoped conversation
    // is loading; it must not briefly become an empty adventure.
    if (!conversationId) return storedPersonalityMode;
    // If we have a brainConversationId and it matches, we're in brain mode
    if (brainConversationId && conversationId === brainConversationId) {
      return 'brain';
    }
    // If we have a conversationId but brainConversationId isn't set yet, use stored mode
    if (conversationId && !brainConversationId) {
      return storedPersonalityMode;
    }
    // Other loaded conversations are adventures.
    return 'game_master';
  }, [conversationId, brainConversationId, storedPersonalityMode]);
  const setPersonalityMode = (mode: PersonalityModeId) => {
    setStoredPersonalityMode(mode);
    localStorage.setItem('lastPersonalityMode', mode);
    if (mode === 'brain' && brainConversationId) {
      setConversationId(brainConversationId);
    }
  };

  const loadDemoConversation = useCallback(async (mode: PersonalityModeId, requestedId?: string | null) => {
    const intent = ++conversationIntentRef.current;
    const [gm, brain] = await Promise.all([
      import('./dev/gmDemoConversation'),
      import('./dev/brainDemoConversation'),
    ]);
    if (intent !== conversationIntentRef.current) return;
    const isBrain = mode === 'brain';
    const customAdventure = !isBrain && requestedId !== undefined && requestedId !== gm.DEMO_CONVERSATION_ID;
    const savedCharacter = customAdventure && requestedId
      ? queryClient.getQueryData<CharacterRecord>(gmKeys.character(requestedId)) : null;
    setBrainConversationId(brain.BRAIN_DEMO_CONVERSATION_ID);
    setConversationId(isBrain ? brain.BRAIN_DEMO_CONVERSATION_ID : customAdventure ? requestedId ?? null : gm.DEMO_CONVERSATION_ID);
    setStoredPersonalityMode(mode);
    setMessages(isBrain ? brain.brainDemoMessages : customAdventure ? loadCachedMessages(requestedId ?? '') ?? [] : gm.demoMessages);
    setCharacterState(isBrain ? null : customAdventure ? savedCharacter ?? null : gm.demoCharacter);
    setAdventureState(isBrain || customAdventure ? null : gm.demoAdventure);
    setQuestSteps(isBrain || customAdventure ? [] : gm.demoQuestSteps);
    setQuestContext(isBrain || customAdventure ? null : { conversationId: gm.DEMO_CONVERSATION_ID, quests: gm.demoQuests });
    setShowCharacterCreation(customAdventure && !savedCharacter);
    setIsWaitingForResponse(false);
    setIsSelectingConversation(false);
  }, [queryClient]);

  // Local preview replies must not arrive in a different conversation or after unmount.
  const demoReplyTimers = useRef<number[]>([]);
  useEffect(() => () => {
    demoReplyTimers.current.forEach(window.clearTimeout);
    demoReplyTimers.current = [];
  }, [conversationId]);

  const ensureAdventureState = useCallback(async (convId: string, modeOverride?: string): Promise<AdventureRecord | null> => {
    const activeMode = normalizePersonalityMode(modeOverride ?? effectivePersonality);
    if (activeMode !== 'game_master') return null;
    try {
      const discovered = await queryClient.fetchQuery(adventureQuery(convId));
      let adventure: AdventureRecord | null = discovered;
      if (!adventure) {
        const created = await dataClient.models.GameMasterAdventure.create({
          conversationId: convId,
          title: 'The Shadowed Forest',
          genre: 'Dark Fantasy',
          tone: 'Gritty',
          difficulty: 'Deadly',
          safetyLevel: 'User Directed',
        });
        adventure = created.data ? (created.data as AdventureRecord) : null;
        if (adventure) {
          queryClient.setQueryData(gmKeys.adventure(convId), adventure);
        }
      }
      if (adventure) {
        setAdventureState(adventure);
        commitLocation(adventure.currentLocation || adventure.lastLocation, convId);
      }
      return adventure;
    } catch (error) {
      console.error('Error ensuring Game Master adventure state:', error);
      return null;
    }
  }, [effectivePersonality, queryClient]);

  const findCharacterByConversation = useCallback(async (convId: string): Promise<CharacterRecord | null> => {
    return queryClient.fetchQuery(characterQuery(convId));
  }, [queryClient]);

  const fetchCharacter = useCallback(async (convId: string): Promise<CharacterRecord | null> => {
    // Prevent duplicate creation with ref-based lock
    if (characterCreationLock.current) {
      return characterState;
    }
    
    setIsLoadingCharacter(true);
    
    try {
      const character = await findCharacterByConversation(convId);

      if (character) {
        const storedAvatarId = getStoredConversationAvatarId(convId);
        const avatarId = getAvatarOptionById(character.avatarId ?? '')?.id
          ?? getAvatarOptionById(storedAvatarId)?.id
          ?? '';
        const hydratedCharacter = avatarId ? { ...character, avatarId } : character;
        queryClient.setQueryData(gmKeys.character(convId), hydratedCharacter);
        setCharacterState(hydratedCharacter);
        if (avatarId) {
          writeStoredConversationAvatar(convId, avatarId);
        }
        if (!character.avatarId && avatarId) {
          try {
            await dataClient.models.GameMasterCharacter.update({
              id: character.id,
              avatarId,
            });
          } catch (avatarPersistError) {
            console.warn('Unable to persist auto-selected avatar, using local fallback:', avatarPersistError);
          }
        }
        setShowCharacterCreation(false);
        return hydratedCharacter;
      }

      // No character exists yet - show character creation consistently and immediately.
      // Clear any stale character from a previous conversation so the creation
      // panel isn't masked by outdated data.
      setCharacterState(null);
      setShowCharacterCreation(true);
      return null;
    } catch (error) {
      console.error('❌ Error loading character:', error);
      characterCreationLock.current = false;
      setCharacterState(null);
      return null;
    } finally {
      setIsLoadingCharacter(false);
    }
  }, [characterState, findCharacterByConversation, queryClient]);

  const createCharacter = useCallback(async (convId: string, characterData: CharacterCreationInput) => {
    if (characterCreationLock.current) {
      return;
    }
    
    characterCreationLock.current = true;
    
    try {
      // Calculate derived stats using game framework
      const { calculateDerivedStats, getClass } = await import('./game');
      const classId = characterData.characterClass.toLowerCase();
      const classData = getClass(classId);
      
      const derivedStats = calculateDerivedStats({
        strength: characterData.strength,
        dexterity: characterData.dexterity,
        constitution: characterData.constitution,
        intelligence: characterData.intelligence,
        wisdom: characterData.wisdom,
        charisma: characterData.charisma,
      }, classId, 1);
      
      const startingEquipment = classData?.startingEquipment || ['Rusty Sword', 'Leather Armor', '5 Gold'];
      const avatarId = getAvatarOptionById(characterData.avatarId ?? '')?.id ?? chooseAutoAvatarId({
        name: characterData.name,
        race: characterData.race,
        characterClass: characterData.characterClass,
      });
      
      // Convert starting equipment to InventoryItem format
      const inventoryItems: InventoryItem[] = startingEquipment.map((itemName: string) => {
        let type: InventoryItem['type'] = 'consumable';
        if (itemName.toLowerCase().includes('sword') || itemName.toLowerCase().includes('dagger') || itemName.toLowerCase().includes('bow')) {
          type = 'weapon';
        } else if (itemName.toLowerCase().includes('armor') || itemName.toLowerCase().includes('shield')) {
          type = 'armor';
        } else if (itemName.toLowerCase().includes('gold') || itemName.toLowerCase().includes('coin')) {
          type = 'currency';
        }
        
        return {
          id: crypto.randomUUID(),
          name: itemName,
          type,
          quantity: 1,
        };
      });
      
      const baseCharacterPayload = {
        adventureId: 'placeholder',
        conversationId: convId,
        name: characterData.name,
        race: characterData.race,
        characterClass: characterData.characterClass,
        level: 1,
        experience: 0,
        strength: characterData.strength,
        dexterity: characterData.dexterity,
        constitution: characterData.constitution,
        intelligence: characterData.intelligence,
        wisdom: characterData.wisdom,
        charisma: characterData.charisma,
        maxHP: derivedStats.maxHP,
        currentHP: derivedStats.maxHP,
        armorClass: derivedStats.armorClass,
        inventory: JSON.stringify(inventoryItems),
        skills: JSON.stringify({}),
        statusEffects: JSON.stringify([]),
        version: 1,
      };
      const createdWithAvatar = isTestModeEnabled()
        ? { data: { ...baseCharacterPayload, id: `demo-character-${crypto.randomUUID()}`, avatarId } as CharacterRecord, errors: undefined }
        : await dataClient.models.GameMasterCharacter.create({
          ...baseCharacterPayload,
          ...(avatarId ? { avatarId } : {}),
        });
      let created = createdWithAvatar;

      if (!createdWithAvatar.data?.id) {
        console.warn('Primary character create failed; retrying without avatarId.', createdWithAvatar.errors);
        created = await dataClient.models.GameMasterCharacter.create(baseCharacterPayload);
      }
      
      if (created.data?.id) {
        const createdAvatarId = getAvatarOptionById(avatarId)?.id ?? '';
        const createdCharacter = createdAvatarId
          ? { ...(created.data as CharacterRecord), avatarId: createdAvatarId }
          : (created.data as CharacterRecord);
        queryClient.setQueryData(gmKeys.character(convId), createdCharacter);
        setCharacterState(createdCharacter);
        if (createdAvatarId) {
          writeStoredConversationAvatar(convId, createdAvatarId);
        }
        const conversationTitle = (characterData.name || '').trim();
        if (conversationTitle && !isTestModeEnabled()) {
          try {
            await dataClient.models.Conversation.update({
              id: convId,
              title: conversationTitle,
            });
            setConversationListRefreshKey((prev) => prev + 1);
          } catch (titleError) {
            console.error('Character created, but failed to update conversation title:', titleError);
          }
        }
        // Small delay to ensure database write propagates
        if (!isTestModeEnabled()) await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        const primaryErrorText = formatModelErrors(createdWithAvatar.errors);
        const fallbackErrorText = formatModelErrors(created.errors);
        const combinedErrorText = [primaryErrorText, fallbackErrorText].filter(Boolean).join(' | ');
        console.error('Character creation failed:', {
          primaryErrors: createdWithAvatar.errors,
          fallbackErrors: created.errors,
          combinedErrorText,
        });
        throw new Error(combinedErrorText ? `Failed to create character: ${combinedErrorText}` : 'Failed to create character');
      }
    } catch (createError) {
      console.error('Error during character creation:', createError);
      throw createError;
    } finally {
      characterCreationLock.current = false;
    }
  }, [queryClient]);

  const updateInventory = useCallback(async (newInventory: InventoryItem[]) => {
    if (!characterState?.id) {
      throw new Error('No character loaded');
    }
    
    // Optimistic update
    const previousInventory = characterState.inventory;
    setCharacterState(prev => prev ? { ...prev, inventory: JSON.stringify(newInventory) } : prev);
    queryClient.setQueryData(gmKeys.character(conversationId ?? characterState.conversationId ?? ''), (prev: CharacterRecord | null | undefined) =>
      prev ? { ...prev, inventory: JSON.stringify(newInventory) } : prev);
    
    try {
      await dataClient.models.GameMasterCharacter.update({
        id: characterState.id,
        inventory: JSON.stringify(newInventory),
      });
    } catch (error) {
      // Rollback on error
      setCharacterState(prev => prev ? { ...prev, inventory: previousInventory } : prev);
      queryClient.setQueryData(gmKeys.character(conversationId ?? characterState.conversationId ?? ''), (prev: CharacterRecord | null | undefined) =>
        prev ? { ...prev, inventory: previousInventory } : prev);
      throw error;
    }
  }, [characterState, conversationId, queryClient]);

  const fetchAdventureBundle = useCallback(async (convId: string, modeOverride?: string, knownCharacter?: CharacterRecord) => {
    // Test mode has no AppSync; the demo fixture is authoritative.
    if (isTestModeEnabled()) return;
    // Prevent duplicate fetches for the same conversation
    if (adventureFetchLock.current === convId) {
      return;
    }
    
    adventureFetchLock.current = convId;
    setIsLoadingAdventure(true);
    
    try {
      const activeMode = normalizePersonalityMode(modeOverride ?? effectivePersonality);
      if (activeMode !== 'game_master') {
        setAdventureState(null);
        setQuestSteps([]);
        setCharacterState(null);
        setShowCharacterCreation(false);
        adventureFetchLock.current = null;
        setIsLoadingAdventure(false);
        return;
      }

      // Fetch character and adventure state in parallel
      const [character, adventure] = await Promise.all([
        knownCharacter ? Promise.resolve(knownCharacter) : fetchCharacter(convId),
        ensureAdventureState(convId, activeMode),
      ]);

      if (!character || !adventure || !adventure.id) {
        if (!character) {
          setAdventureState(null);
          setQuestSteps([]);
        }
        adventureFetchLock.current = null;
        setIsLoadingAdventure(false);
        return;
      }

      const adventureId = adventure.id as string;
      
      try {
        const steps = await queryClient.fetchQuery(questStepsQuery(adventureId));
        setQuestSteps(steps);
      } catch (error) {
        console.error('Error loading Game Master data:', error);
      }
    } finally {
      adventureFetchLock.current = null;
      setIsLoadingAdventure(false);
    }
  }, [effectivePersonality, ensureAdventureState, fetchCharacter, queryClient]);

  const recordQuestStep = useCallback(async (brainResponse: {
    id?: string;
    messageId?: string;
    response?: string;
  }) => {
    if (effectivePersonality !== 'game_master' || !conversationId) return;
    const adventure = await ensureAdventureState(conversationId);
    if (!adventure) return;
    const narration = brainResponse.response ?? '';
    const summary = summarizeText(narration);
    try {
      const created = await dataClient.models.GameMasterQuestStep.create({
        adventureId: adventure.id!,
        conversationId,
        brainResponseId: brainResponse.id ?? '',
        messageId: brainResponse.messageId ?? '',
        summary,
        narration,
        dangerLevel: inferDangerLevel(narration),
        locationTag: resolveLocationName(adventure.currentLocation ?? adventure.lastLocation ?? ''),
        createdAt: new Date().toISOString(),
      });
      const questStep = (created.data as QuestStepRecord | null) ?? null;
      if (questStep) {
        setQuestSteps(prev => [...prev, questStep]);
        queryClient.setQueryData(gmKeys.questSteps(adventure.id!), (prev: QuestStepRecord[] | undefined) =>
          prev ? [...prev, questStep] : [questStep]);
        await dataClient.models.GameMasterAdventure.update({
          id: adventure.id!,
          lastStepId: questStep.id,
          updatedAt: new Date().toISOString(),
        });
        queryClient.setQueryData(gmKeys.adventure(conversationId), (prev: AdventureRecord | null | undefined) =>
          prev ? { ...prev, lastStepId: questStep.id } : prev);
        setAdventureState((prev: AdventureRecord | null) => (prev ? { ...prev, lastStepId: questStep.id } : prev));
      }
    } catch (error) {
      console.error('Error recording quest step:', error);
    }
  }, [conversationId, effectivePersonality, ensureAdventureState, queryClient]);

  const recordPlayerChoice = useCallback(async (messageId: string, content: string) => {
    if (effectivePersonality !== 'game_master' || !conversationId) return;
    const adventure = await ensureAdventureState(conversationId);
    if (!adventure) return;
    if (!adventure.lastStepId) {
      // Wait for at least one quest step before tracking choices
      return;
    }
    try {
      await dataClient.models.GameMasterPlayerChoice.create({
        questStepId: adventure.lastStepId,
        conversationId,
        messageId,
        content,
        toneTag: inferToneTag(content),
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error recording player choice:', error);
    }
  }, [conversationId, effectivePersonality, ensureAdventureState]);

  useEffect(() => {
    if (!conversationId) {
      setAdventureState(null);
      setQuestSteps([]);
      setCharacterState(null);
      if (effectivePersonality !== 'game_master') {
        setShowCharacterCreation(false);
      }
      return;
    }
    if (effectivePersonality === 'game_master') {
      fetchAdventureBundle(conversationId);
    }
  }, [conversationId, effectivePersonality, fetchAdventureBundle]);

  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll(conversationId, isDesktop);
  const newInteractionPrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const streamedMessageIdsRef = useRef<Set<string>>(new Set());
  const activeStreamRef = useRef<AbortController | null>(null);
  useEffect(() => () => { activeStreamRef.current?.abort(); }, []);
  const submitDiceResult = useCallback(async (request: DiceRollRequest, diceValue: number) => {
    if (!conversationId) throw new Error('No active adventure');
    setIsWaitingForResponse(true);
    try {
      const result = await dataClient.models.Message.create({
        content: JSON.stringify({ type: 'DICE_RESULT', requestId: request.requestId, diceValue, sides: request.sides ?? 20 }),
        conversationId,
      });
      if (result.errors?.length || !result.data?.id) throw new Error(formatModelErrors(result.errors) || 'Result was not saved');
    } catch (error) {
      setIsWaitingForResponse(false);
      throw error;
    }
  }, [conversationId]);
  const diceBusy = isWaitingForResponse || isSelectingConversation || messages.some(message => message.isTyping);
  const { requestRoll, syncRequestedRoll, roll: handleDiceRoll, activeRequestId: activeDiceRequestId, hasPendingRoll } = useChatDiceRolls({
    conversationId, messages, setMessages, busy: diceBusy, onSubmit: submitDiceResult,
  });

  useEffect(() => {
    if (!isOptionsMenuOpen) return;
    optionsMenuRef.current?.querySelector<HTMLButtonElement>('#desktop-options-menu button:not(:disabled)')?.focus();
    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node;
      const clickedProfileDropdown = optionsMenuRef.current?.contains(target);
      if (!clickedProfileDropdown) {
        setIsOptionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOptionsMenuOpen]);

  useEffect(() => () => {
    if (newInteractionPrimeTimerRef.current) {
      clearTimeout(newInteractionPrimeTimerRef.current);
      newInteractionPrimeTimerRef.current = null;
    }
  }, []);

  // Task 11.3 — cleanup optimistic rollback timer on unmount to prevent memory leaks
  useEffect(() => () => {
    if (optimisticRollbackTimerRef.current) {
      clearTimeout(optimisticRollbackTimerRef.current);
      optimisticRollbackTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    async function getUserAttributes() {
      try {
        // For test mode, set mock user attributes
        if (isTestModeEnabled()) {
          console.log('✅ Test mode: Setting mock user attributes');
          setUserAttributes({ sub: 'test-user-123', email: 'test@example.com' });
          return;
        }

        const attributes = await fetchUserAttributes();
        setUserAttributes(attributes);
      } catch (error) {
        console.error('❌ Error fetching user attributes:', error);
      }
    }
    getUserAttributes();
  }, []);

  // Initialize or load the singular Brain conversation
  // Always runs to ensure brainConversationId is set
  useEffect(() => {
    async function initializeBrainConversation() {
      // Test mode has no backend; the demo fixture owns the active conversation.
      if (isTestModeEnabled()) return;
      if (!userAttributes || brainConversationId) {
        return;
      }
      
      try {
        const currentUserId = userAttributes.sub || userAttributes.email || 'anonymous';
        
        const { data: conversations } = await dataClient.models.Conversation.list({
          filter: { experience: { eq: 'brain' } },
        });
        
        if (conversations && conversations.length > 0) {
          const brainConv = conversations[0];
          if (brainConv?.id) {
            setBrainConversationId(brainConv.id);
          }
        } else {
          const { data: newConversation } = await dataClient.models.Conversation.create({
            title: 'Brain',
            participants: [currentUserId],
            personalityMode: 'brain',
            experience: 'brain',
          });
          
          if (newConversation?.id) {
            setBrainConversationId(newConversation.id);
          }
        }
      } catch (error) {
        console.error('Error initializing Brain conversation:', error);
      }
    }
    
    initializeBrainConversation();
  }, [userAttributes, brainConversationId]);

  // Cache messages in localStorage whenever they change (no typing animation in progress)
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const hasTypingMessage = messages.some(m => m.isTyping);
    if (!hasTypingMessage) {
      saveCachedMessages(conversationId, messages);
    }
  }, [conversationId, messages]);

  // Save conversationId scoped by mode to prevent cross-talk between modes.
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem(getLastConversationStorageKey(effectivePersonality), conversationId);
    }
  }, [conversationId, effectivePersonality]);

  // The route and rail select the mode; the header stays context-independent.

  useEffect(() => {
    writeStoredBoolean(UI_MOBILE_INFO_EXPANDED_KEY, mobileInfoExpanded);
  }, [mobileInfoExpanded]);

  useEffect(() => {
    writeStoredBoolean(UI_MOBILE_CHARACTER_EXPANDED_KEY, mobileCharSheetExpanded);
  }, [mobileCharSheetExpanded]);

  // Save the last active conversation ID and personality mode for restoration on refresh
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('lastActiveConversationId', conversationId);
      localStorage.setItem('lastPersonalityMode', effectivePersonality);
    }
  }, [conversationId, effectivePersonality]);

  // Honor an explicit GM draft on mount. Otherwise load the routed conversation
  // or wait for the account's Brain conversation to resolve.
  const initialLoadDoneRef = useRef(false);
  const previousConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userAttributes || initialLoadDoneRef.current) return;

    async function loadInitialConversation() {
      // Test mode honors the routed mode; both previews stay entirely local.
      if (isTestModeEnabled()) {
        initialLoadDoneRef.current = true;
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('mockNewConversation');
        }
        await loadDemoConversation(routeMode ?? storedPersonalityMode, routeConversationId);
        return;
      }

      // /quest/new is an explicit character-creation draft, not a missing
      // Brain conversation. Keep it in GM mode across route remounts.
      if (!conversationId && (routeMode ?? storedPersonalityMode) === 'game_master') {
        initialLoadDoneRef.current = true;
        setShowCharacterCreation(true);
        setIsSelectingConversation(false);
        return;
      }

      if (conversationId) {
        // We have a stored conversation — load its data
        initialLoadDoneRef.current = true;
        await handleSelectConversation(conversationId);
      } else if (brainConversationId) {
        // No stored conversation — load Brain
        initialLoadDoneRef.current = true;
        await handleSelectConversation(brainConversationId);
      }
    }

    loadInitialConversation();
  }, [userAttributes, conversationId, brainConversationId, routeMode, routeConversationId, storedPersonalityMode, loadDemoConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conversationId) return;
    // Test mode fakes replies locally; no AppSync subscription to open.
    if (isTestModeEnabled()) return;

    console.log('Setting up subscription for conversation:', conversationId);
    
    try {
      console.log('Setting up raw subscription without filters');
      
      // Use the raw GraphQL subscription without filters
      const subscription = dataClient.graphql({
        query: `
          subscription OnCreateBrainResponse {
            onCreateBrainResponse {
              id
              conversationId
              response
              owner
              messageId
              createdAt
              sensations
              thoughts
              memories
              selfReflection
            }
          }
        `
      });
      
      // Add proper type for the subscription
      type GraphQLSubscriptionResult = {
        data?: {
          onCreateBrainResponse?: {
            id: string;
            conversationId: string;
            response: string;
            owner: string;
            messageId: string;
            createdAt: string;
            sensations?: string[];
            thoughts?: string[];
            memories?: string;
            selfReflection?: string;
          };
        };
        errors?: Array<{ message: string }>;
      };
      
      const rawSubscription = (subscription as unknown as { subscribe: (handlers: { next: (result: GraphQLSubscriptionResult) => void; error: (err: Error) => void; }) => { unsubscribe: () => void; }; }).subscribe({
        next: (result: GraphQLSubscriptionResult) => {
          console.log('RAW SUBSCRIPTION RECEIVED:', result);
          
          // Try to extract the data
          const brainResponse = result.data?.onCreateBrainResponse;
          if (brainResponse) {
            console.log('Extracted brain response:', brainResponse);
            console.log('Sensations:', brainResponse.sensations);
            console.log('Thoughts:', brainResponse.thoughts);
            console.log('Memories:', brainResponse.memories);
            console.log('Self Reflection:', brainResponse.selfReflection);
            console.log('Current conversation ID:', conversationId);
            console.log('Response conversation ID:', brainResponse.conversationId);
            console.log('Response owner:', brainResponse.owner);
            
            // Check if this response is for our conversation
            if (brainResponse.conversationId === conversationId) {
              if (effectivePersonality === 'game_master') {
                recordQuestStep(brainResponse);

                // Extract location from the GM's JSON response and update adventureState immediately
                // This is a fast-path that works before the Lambda's AppSync write propagates
                try {
                  const raw = brainResponse.response ?? '';
                  const jsonMatch = raw.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const loc = parsed.current_location || parsed.area_transition || parsed.location;
                    if (loc && typeof loc === 'string' && loc.trim()) {
                      commitLocation(loc.trim());
                      queryClient.setQueryData(gmKeys.adventure(conversationId), (prev: AdventureRecord | null | undefined) =>
                        prev ? { ...prev, currentLocation: loc.trim(), lastLocation: loc.trim() } : prev);
                      setAdventureState(prev => prev ? { ...prev, currentLocation: loc.trim(), lastLocation: loc.trim() } : prev);
                    }
                  }
                } catch {
                  // Non-JSON response — ignore
                }
              }

              // If this message was already streamed live via AG-UI, don't add a
              // duplicate bubble — just reconcile the authoritative metadata.
              const wasStreamed = streamedMessageIdsRef.current.has(brainResponse.messageId);
              if (wasStreamed) {
                setMessages(prev => {
                  const next = [...prev];
                  const idx = next.length - 1;
                  if (idx >= 0 && next[idx].role === 'assistant') {
                    next[idx] = {
                      ...next[idx],
                      isTyping: false,
                      fullContent: next[idx].fullContent ?? brainResponse.response ?? '',
                      sensations: brainResponse.sensations?.filter((s): s is string => s !== null) || next[idx].sensations,
                      thoughts: brainResponse.thoughts?.filter((t): t is string => t !== null) || next[idx].thoughts,
                      memories: brainResponse.memories || next[idx].memories,
                      selfReflection: brainResponse.selfReflection || next[idx].selfReflection,
                    };
                  }
                  return next;
                });
                setIsWaitingForResponse(false);
                return;
              }

              // A single update; the bubble handles its own arrival animation.
              setMessages(prev => {
                const newMessages: Message[] = [...prev, { 
                  role: 'assistant' as const, 
                  messageId: brainResponse.messageId || brainResponse.id,
                  content: brainResponse.response ?? '',
                  isTyping: false,
                  populateOnMount: true,
                  fullContent: brainResponse.response ?? '',
                  sensations: brainResponse.sensations?.filter((s): s is string => s !== null) || [],
                  thoughts: brainResponse.thoughts?.filter((t): t is string => t !== null) || [],
                  memories: brainResponse.memories || '',
                  selfReflection: brainResponse.selfReflection || '',
                }];
                
                return newMessages;
              });
              
              setIsWaitingForResponse(false);
            } else {
              console.log('❌ NO MATCH: Response does not match criteria');
            }
          }
        },
        error: (err: Error) => {
          console.error('Raw subscription error:', err);
          setIsWaitingForResponse(false);
        }
      });
      
      return () => {
        console.log('Cleaning up raw subscription');
        rawSubscription.unsubscribe();
      };
    } catch (error) {
      console.error('Error setting up raw subscription:', error);
      return () => {}; // Empty cleanup function
    }
  }, [conversationId, effectivePersonality, recordQuestStep, queryClient]);

  // Task 11.1 — PlayerState AppSync subscription
  // Subscribes to PlayerState records for the active conversation and keeps local
  // playerState in sync with authoritative DynamoDB values.
  useEffect(() => {
    if (!conversationId || effectivePersonality !== 'game_master') return;
    if (isTestModeEnabled()) return;

    // Guard: PlayerState model may not exist if the sandbox hasn't been redeployed
    // after the schema was updated. Skip silently rather than crashing.
    if (!dataClient.models.PlayerState) {
      console.warn('PlayerState model not available — run `amplify sandbox` to deploy the updated schema.');
      return;
    }

    const sub = dataClient.models.PlayerState.observeQuery({
      filter: { campaignId: { eq: conversationId } },
    }).subscribe({
      next: ({ items }) => {
        const latest = items[0] ?? null;
        if (latest) {
          setPlayerState(latest);
          confirmedPlayerStateRef.current = latest;
          // Clear any pending rollback timer — authoritative value arrived
          if (optimisticRollbackTimerRef.current) {
            clearTimeout(optimisticRollbackTimerRef.current);
            optimisticRollbackTimerRef.current = null;
          }
          setPlayerStateError(null);

          // A request adds a chat prompt, never an automatic roll.
          syncRequestedRoll(latest.pendingDiceRoll, conversationId);
        }
      },
      error: (err) => {
        console.error('PlayerState subscription error:', err);
      },
    });

    return () => sub.unsubscribe();
  }, [conversationId, effectivePersonality, syncRequestedRoll]);

  // Keep both desktop and mobile quest views scoped to the current adventure.
  useEffect(() => {
    if (!conversationId || effectivePersonality !== 'game_master' || isTestModeEnabled()) return;
    let active = true;
    const sub = dataClient.models.ActiveQuest.observeQuery({
      filter: { campaignId: { eq: conversationId } },
    }).subscribe({
      next: ({ items }) => {
        if (active) setQuestContext({ conversationId, quests: mapActiveQuests(items) });
      },
      error: error => console.error('Quest subscription error:', error),
    });
    return () => { active = false; sub.unsubscribe(); };
  }, [conversationId, effectivePersonality]);

  // Subscribe to GameMasterAdventure updates so currentLocation stays live
  useEffect(() => {
    if (!conversationId || effectivePersonality !== 'game_master') return;
    if (isTestModeEnabled()) return;
    if (!dataClient.models.GameMasterAdventure) return;

    // Sync to this conversation's stored location so the badge hydrates
    // immediately on refresh, and stale values from a previous conversation
    // never leak across a switch.
    setAuthoritativeLocation(getStoredGmLocation(conversationId));

    const sub = dataClient.models.GameMasterAdventure.observeQuery({
      filter: { conversationId: { eq: conversationId } },
    }).subscribe({
      next: ({ items }) => {
        const latest = pickLatestAdventure(items as AdventureRecord[]);
        if (!latest) return;
        // Seed the placeholder-proof location from a real row. This survives even
        // if a later publish only contains stub/legacy placeholder rows.
        const rowLoc = latest.currentLocation || latest.lastLocation;
        commitLocation(rowLoc);
        const mergeLatest = (prev: AdventureRecord | null | undefined): AdventureRecord => {
          // Never let a placeholder row downgrade a location we already know.
          const incomingPlaceholder =
            !rowLoc ||
            typeof rowLoc !== 'string' ||
            rowLoc.trim() === '' ||
            rowLoc.trim() === GM_PLACEHOLDER_LOCATION;
          if (incomingPlaceholder && prev?.currentLocation) {
            return { ...latest, currentLocation: prev.currentLocation, lastLocation: prev.lastLocation || latest.lastLocation };
          }
          return latest;
        };
        setAdventureState(prev => mergeLatest(prev));
        queryClient.setQueryData(gmKeys.adventure(conversationId), (prev: AdventureRecord | null | undefined) => mergeLatest(prev));
      },
      error: (err) => {
        console.error('GameMasterAdventure subscription error:', err);
      },
    });

    return () => sub.unsubscribe();
  }, [conversationId, effectivePersonality, queryClient]);


  // Task 11.2 — optimistic XP and HP update applied immediately on message submit.
  // Task 11.3 — if subscription doesn't confirm within 10s, roll back and show error toast.
  const applyOptimisticPlayerStateUpdate = useCallback(
    (patch: Partial<PlayerStateRecord>) => {
      setPlayerState((prev) => {
        if (!prev) return prev;
        const optimistic = { ...prev, ...patch };
        // Schedule rollback if subscription doesn't confirm
        if (optimisticRollbackTimerRef.current) {
          clearTimeout(optimisticRollbackTimerRef.current);
        }
        optimisticRollbackTimerRef.current = setTimeout(() => {
          setPlayerState(confirmedPlayerStateRef.current);
          setPlayerStateError('Could not confirm stat update — reverted to last known state.');
          optimisticRollbackTimerRef.current = null;
        }, 10_000);
        return optimistic;
      });
    },
    [],
  );

  const handleSendMessage = async (content: string, targetConversationId: string): Promise<void> => {
    if (isTestModeEnabled()) {
      if (!targetConversationId) return;
      setIsWaitingForResponse(true);
      const isBrain = effectivePersonality === 'brain';
      const reply = isBrain
        ? (await import('./dev/brainDemoConversation')).buildBrainDemoReply(content)
        : (await import('./dev/gmDemoConversation')).buildGmDemoReply(content);
      const messageId = crypto.randomUUID();
      demoReplyTimers.current.push(window.setTimeout(() => {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: reply, populateOnMount: true, isTyping: isBrain, messageId },
        ]);
        setIsWaitingForResponse(false);
        if (isBrain) {
          demoReplyTimers.current.push(window.setTimeout(() => {
            setMessages(prev => prev.map(message => message.messageId === messageId
              ? { ...message, isTyping: false } : message));
          }, Math.ceil(reply.length / 90 * 1000) + 250));
        }
      }, 950));
      return;
    }

    try {
      setIsWaitingForResponse(true);

      if (!targetConversationId) {
        console.error('No conversation ID available');
        setIsWaitingForResponse(false);
        return;
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: targetConversationId,
        streaming: true,
      });

      const streamedMessageId = savedMessage?.id ?? null;
      if (!streamedMessageId) {
        console.error('Failed to create message — no message id returned');
        setIsWaitingForResponse(false);
        return;
      }

      await recordPlayerChoice(streamedMessageId, content);

      const owner = userAttributes?.sub || userAttributes?.email || 'anonymous';

      // AG-UI streaming over the Lambda Function URL. The DDB stream handler
      // skips messages flagged streaming=true, so the response arrives here
      // token-by-token instead of via the AppSync subscription.
      streamedMessageIdsRef.current.add(streamedMessageId);

      const controller = new AbortController();
      activeStreamRef.current = controller;
      try {
        await streamAgentMessage({
          conversationId: targetConversationId,
          messageId: streamedMessageId,
          owner,
          content,
          signal: controller.signal,
          onEvent: (event: AguiEvent) => {
            if (controller.signal.aborted) return;
            const messageId = typeof event.messageId === 'string' ? event.messageId : undefined;
            switch (event.type) {
            case 'TEXT_MESSAGE_START':
              setIsWaitingForResponse(false);
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: '',
                  isTyping: true,
                  fullContent: '',
                  messageId,
                  toolCalls: [],
                  populateOnMount: true,
                },
              ]);
              break;

            case 'TEXT_MESSAGE_CONTENT': {
              const delta = typeof event.delta === 'string' ? event.delta : '';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = {
                    ...next[idx],
                    content: (next[idx].content ?? '') + delta,
                    isTyping: true,
                  };
                }
                return next;
              });
              break;
            }

            case 'TEXT_MESSAGE_END':
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = {
                    ...next[idx],
                    isTyping: false,
                    fullContent: next[idx].content,
                  };
                }
                return next;
              });
              break;

            case 'REASONING_MESSAGE_START':
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = { ...next[idx], reasoning: '' };
                }
                return next;
              });
              break;

            case 'REASONING_MESSAGE_CONTENT': {
              const delta = typeof event.delta === 'string' ? event.delta : '';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = {
                    ...next[idx],
                    reasoning: (next[idx].reasoning ?? '') + delta,
                  };
                }
                return next;
              });
              break;
            }

            case 'STEP_STARTED': {
              const stepName = typeof event.stepName === 'string' ? event.stepName : '';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = { ...next[idx], activeStep: stepName };
                }
                return next;
              });
              break;
            }

            case 'TOOL_CALL_START': {
              const toolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : crypto.randomUUID();
              const name = typeof event.toolCallName === 'string' ? event.toolCallName : 'tool';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  const toolCalls = next[idx].toolCalls ?? [];
                  next[idx] = {
                    ...next[idx],
                    toolCalls: [...toolCalls, { toolCallId, name, args: '', status: 'running' as const }],
                  };
                }
                return next;
              });
              break;
            }

            case 'TOOL_CALL_ARGS': {
              const toolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : '';
              const delta = typeof event.delta === 'string' ? event.delta : '';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant' && next[idx].toolCalls) {
                  const toolCalls = next[idx].toolCalls.map(tc =>
                    tc.toolCallId === toolCallId ? { ...tc, args: tc.args + delta } : tc,
                  );
                  next[idx] = { ...next[idx], toolCalls };
                }
                return next;
              });
              break;
            }

            case 'TOOL_CALL_END':
            case 'TOOL_CALL_RESULT': {
              const toolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : '';
              const result = event.type === 'TOOL_CALL_RESULT' ? JSON.stringify(event.content ?? '') : undefined;
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant' && next[idx].toolCalls) {
                  const toolCalls = next[idx].toolCalls.map(tc =>
                    tc.toolCallId === toolCallId
                      ? { ...tc, status: 'completed' as const, ...(result !== undefined ? { result } : {}) }
                      : tc,
                  );
                  next[idx] = { ...next[idx], toolCalls };
                }
                return next;
              });
              break;
            }

            case 'CUSTOM':
              if (event.name === 'dice_roll_requested') {
                requestRoll(event.value, targetConversationId);
                break;
              }
              if (event.name === 'response_complete') {
                const value = event.value as Record<string, unknown> | undefined;
                const responseText = typeof value?.response === 'string' ? value.response : '';
                const meta = (value?.metadata ?? {}) as Record<string, unknown>;
                const sensations = Array.isArray(meta.sensations) ? (meta.sensations as string[]) : undefined;
                const thoughts = Array.isArray(meta.thoughts) ? (meta.thoughts as string[]) : undefined;
                const memories = typeof meta.memories === 'string' ? meta.memories : undefined;
                const selfReflection = typeof meta.self_reflection === 'string' ? meta.self_reflection : undefined;
                setMessages(prev => {
                  const next = [...prev];
                  const idx = next.length - 1;
                  if (idx >= 0 && next[idx].role === 'assistant') {
                    next[idx] = {
                      ...next[idx],
                      content: responseText || next[idx].content,
                      fullContent: responseText || next[idx].fullContent,
                      isTyping: false,
                      sensations: sensations ?? next[idx].sensations,
                      thoughts: thoughts ?? next[idx].thoughts,
                      memories: memories ?? next[idx].memories,
                      selfReflection: selfReflection ?? next[idx].selfReflection,
                    };
                  }
                  return next;
                });
              }
              break;

            case 'STATE_SNAPSHOT': {
              // Authoritative game state from the orchestrator. Prefer this over
              // the observeQuery publish so the badge tracks the persisted location.
              const snapshot = (event as { snapshot?: Record<string, unknown> }).snapshot;
              const loc = snapshot?.location as { name?: string; id?: string } | undefined;
              const locName = loc?.id ? resolveLocationName(loc.id) : (loc?.name ?? '');
              if (locName) {
                commitLocation(locName);
                setAdventureState(prev => {
                  if (!prev) return { currentLocation: locName } as AdventureRecord;
                  return { ...prev, currentLocation: locName };
                });
              }
              break;
            }

            case 'RUN_ERROR': {
              const errMsg = typeof event.message === 'string' ? event.message : 'Stream error';
              setMessages(prev => {
                const next = [...prev];
                const idx = next.length - 1;
                if (idx >= 0 && next[idx].role === 'assistant') {
                  next[idx] = { ...next[idx], streamError: errMsg, isTyping: false };
                }
                return next;
              });
              break;
            }

            default:
              break;
            }
          },
        });

        setIsWaitingForResponse(false);
      } catch (error) {
        if (controller.signal.aborted) {
          setIsWaitingForResponse(false);
          return;
        }
        // Streaming failed — fall back to the AppSync subscription path so the
        // response is still generated by the DDB stream → Lambda pipeline.
        console.error('AG-UI streaming failed, falling back to subscription:', error);
        streamedMessageIdsRef.current.delete(streamedMessageId);
        setMessages(prev => prev.filter(m => m.role !== 'assistant' || !m.isTyping));
        setIsWaitingForResponse(true);
        try {
          await dataClient.models.Message.update({ id: streamedMessageId, streaming: false });
        } catch (updateErr) {
          console.error('Failed to unflag message for fallback:', updateErr);
        }
      } finally {
        if (activeStreamRef.current === controller) activeStreamRef.current = null;
      }

    } catch (error) {
      console.error('Error sending message to backend:', error);
      setIsWaitingForResponse(false);
    }
  };

  const handleSubmit = async (content: string): Promise<boolean> => {
    if (
      !content.trim() || isInputLocked
    ) return false;

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      activeConversationId = await createConversationWithMode(effectivePersonality);
      if (!activeConversationId) {
        return false;
      }
      if (effectivePersonality === 'game_master') {
        if (pendingCharacterDraft) {
          await createCharacter(activeConversationId, pendingCharacterDraft);
          setPendingCharacterDraft(null);
        } else {
          const existingCharacter = await fetchCharacter(activeConversationId);
          if (!existingCharacter) {
            return false;
          }
        }
      }
    }

    const userMessage = content.trim();
    setIsNewInteractionPrimed(false);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    scrollToLatest();

    // Task 11.2 — optimistic XP update: apply a small baseline XP gain immediately
    // so the Context_Window reflects the change before the DynamoDB write confirms.
    // The authoritative value from the PlayerState subscription will reconcile this
    // when it arrives (task 11.1). If it doesn't arrive within 10s, task 11.3 rolls back.
    if (effectivePersonality === 'game_master' && playerState) {
      // Snapshot the confirmed state before mutating so task 11.3 can roll back to it.
      confirmedPlayerStateRef.current = playerState;
      // Award a small baseline XP for player engagement (5 XP per turn).
      const BASELINE_XP_PER_TURN = 5;
      const optimisticXP = (playerState.currentXP ?? 0) + BASELINE_XP_PER_TURN;
      applyOptimisticPlayerStateUpdate({ currentXP: optimisticXP });
    }

    void handleSendMessage(userMessage, activeConversationId);
    return true;
  };

  const handleSelectConversation = async (selectedConversationId: string) => {
    // Avoid re-hydrating the same interaction when it is already active.
    if (selectedConversationId && selectedConversationId === conversationId && messages.length > 0) {
      return;
    }
    
    // If empty string, clear the conversation
    if (!selectedConversationId) {
      setIsSelectingConversation(false);
      setConversationId(null);
      setIsNewInteractionPrimed(false);
      setPendingCharacterDraft(null);
      setMessages([]);
      setIsWaitingForResponse(false);
      setAdventureState(null);
      setQuestSteps([]);
      setCharacterState(null);
      setShowCharacterCreation(false);
      return;
    }

    if (isTestModeEnabled()) {
      await loadDemoConversation(selectedConversationId === brainConversationId ? 'brain' : 'game_master', selectedConversationId);
      return;
    }
    
    setIsSelectingConversation(true);
    setIsNewInteractionPrimed(false);
    setPendingCharacterDraft(null);
    setConversationId(selectedConversationId);
    setIsWaitingForResponse(false);
    setAdventureState(null);
    setQuestSteps([]);
    // Keep the previous character sheet visible while the new character loads
    // to avoid flashing the pulsing skeleton on every conversation switch.
    // fetchCharacter swaps it in place, or clears it if none exists.
    setShowCharacterCreation(false);
    
    // Show cached messages immediately to prevent flicker
    const cached = loadCachedMessages(selectedConversationId);
    if (cached) {
      setMessages(cached);
    } else {
      setMessages([]);
    }
    
    // Load conversation data and messages
    try {
      // Load the conversation to get personality mode
      const conversationData = await queryClient.fetchQuery(conversationQuery(selectedConversationId));
      
      if (conversationData) {
        const storedExperience = conversationData.experience || conversationData.personalityMode || 'brain';
        const normalizedMode = normalizePersonalityMode(storedExperience);
        
        // Update personality mode to match the conversation type
        setPersonalityMode(normalizedMode);
        
        // Load conversation based on its mode
        if (normalizedMode === 'game_master') {
          setShowCharacterCreation(false);
          const character = await fetchCharacter(selectedConversationId);
          if (!character) {
            if (!cached) {
              setMessages([]);
            }
            setIsWaitingForResponse(false);
            return;
          }
          await fetchAdventureBundle(selectedConversationId, normalizedMode, character);
        } else {
          setAdventureState(null);
          setQuestSteps([]);
          setCharacterState(null);
          setShowCharacterCreation(false);
        }
      }
      
      // Skip API fetch if we already have cached messages — avoids stutter
      if (cached) {
        setIsWaitingForResponse(false);
        setIsSelectingConversation(false);
        return;
      }
      
      const [{ data: conversationMessages }, { data: brainResponses }] = await Promise.all([
        dataClient.models.Message.list({ filter: { conversationId: { eq: selectedConversationId } } }),
        dataClient.models.BrainResponse.list({ filter: { conversationId: { eq: selectedConversationId } } }),
      ]);
      
      // Create a timeline of messages and responses
      const timeline: Message[] = [];
      
      // Sort messages by timestamp
      const sortedMessages = (conversationMessages || []).sort((a, b) => {
        const aTime = new Date(a.timestamp || a.createdAt || 0).getTime();
        const bTime = new Date(b.timestamp || b.createdAt || 0).getTime();
        return aTime - bTime;
      });
      
      // Check if there's a pending message (message without response)
      let hasPendingMessage = false;
      
      const responseByMessageId = new Map((brainResponses || []).map(response => [response.messageId, response]));
      // For each message, add it and its corresponding response in linear time.
      sortedMessages.forEach(msg => {
        timeline.push({ role: 'user', content: msg.content || '' });
        
        // Find corresponding brain response
        const response = responseByMessageId.get(msg.id);
        if (response?.response) {
          timeline.push({ 
            role: 'assistant', 
            content: response.response,
            sensations: response.sensations?.filter((s): s is string => s !== null) || [],
            thoughts: response.thoughts?.filter((t): t is string => t !== null) || [],
            memories: response.memories || '',
            selfReflection: response.selfReflection || '',
          });
        } else {
          // This message has no response yet - mark as pending
          hasPendingMessage = true;
        }
      });
      
      // Set messages and scroll to bottom
      setMessages(timeline);
      saveCachedMessages(selectedConversationId, timeline);
      
      // Set waiting state based on whether there's a pending message
      setIsWaitingForResponse(hasPendingMessage);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
      setIsWaitingForResponse(false);
    } finally {
      setIsSelectingConversation(false);
    }
  };

  // URL → workspace: a changed route param (deep link, refresh, back/forward)
  // selects that conversation. URL ← workspace: every other conversation change
  // replaces the current entry, so links stay shareable without polluting history.
  const lastRouteConversationRef = useRef(routeConversationId);
  const lastSyncedRouteRef = useRef<{ conversationId: string | null; mode: PersonalityModeId } | null>(
    routeConversationId === undefined
      ? null
      : { conversationId: routeConversationId, mode: routeMode ?? 'game_master' },
  );
  const syncingFromRouteRef = useRef(false);

  useEffect(() => {
    if (routeConversationId === undefined) return;
    if (routeConversationId === lastRouteConversationRef.current) return;
    lastRouteConversationRef.current = routeConversationId;
    if (!routeConversationId || routeConversationId === conversationId) return;
    syncingFromRouteRef.current = true;
    void handleSelectConversation(routeConversationId);
    // handleSelectConversation is intentionally not a dependency: it is
    // recreated on render and would re-run this effect on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId, conversationId]);

  useEffect(() => {
    if (!onRouteChange) return;
    if (syncingFromRouteRef.current) {
      syncingFromRouteRef.current = false;
      lastSyncedRouteRef.current = { conversationId, mode: effectivePersonality };
      return;
    }
    const last = lastSyncedRouteRef.current;
    if (last && last.conversationId === conversationId && last.mode === effectivePersonality) return;
    lastSyncedRouteRef.current = { conversationId, mode: effectivePersonality };
    onRouteChange({ conversationId, mode: effectivePersonality });
  }, [conversationId, effectivePersonality, onRouteChange]);

  const handleNewConversation = () => {
    // A deliberate new adventure must win over any pending startup hydration.
    initialLoadDoneRef.current = true;
    conversationIntentRef.current += 1;
    adventureFetchLock.current = null;
    previousConversationIdRef.current = conversationId;
    // New conversations are always game_master mode
    const newConversationMode: PersonalityModeId = 'game_master';
    setStoredPersonalityMode(newConversationMode);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getLastConversationStorageKey(newConversationMode));
    }
    setIsSelectingConversation(false);
    setConversationId(null);
    setMessages([]);
    draft.current = '';
    composerRef.current?.clear();
    setIsWaitingForResponse(false);
    setAdventureState(null);
    setQuestSteps([]);
    setCharacterState(null);
    setPendingCharacterDraft(null);
    setShowCharacterCreation(true);
    setDraggingConversationId(null);
    setIsTrashDragOver(false);
    setIsNewInteractionPrimed(false);

    // The final creation action persists the conversation and character.
    // Navigating away from Brain must not leave an API request running in an
    // unmounted route or create an empty chat before the user finishes setup.
  };

  const createConversationWithMode = useCallback(async (modeId: string): Promise<string | null> => {
    try {
      const normalized = normalizePersonalityMode(modeId);
      const defaultTitle = generateDefaultConversationTitle(normalized);
      if (isTestModeEnabled()) {
        const mockConversationId = 'test-conversation-' + Date.now();
        console.log('✅ Test mode: Creating mock conversation:', mockConversationId);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(
            'mockNewConversation',
            JSON.stringify({
              id: mockConversationId,
              title: defaultTitle,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
          );
        }
        setConversationId(mockConversationId);
        setPersonalityMode(normalized);
        setAdventureState(null);
        setQuestSteps([]);
        setCharacterState(null);
        setShowCharacterCreation(normalized === 'game_master');
        setConversationListRefreshKey((prev) => prev + 1);
        return mockConversationId;
      }

      // Get current user for participants
      const attributes = userAttributes ?? await fetchUserAttributes();
      const currentUserId = attributes.sub || attributes.email;
      if (!currentUserId) throw new Error('Unable to resolve the signed-in account');
      if (!userAttributes) setUserAttributes(attributes);

      console.log('Creating new conversation with user:', currentUserId, 'mode:', normalized);
      
      const { data: newConversation } = await dataClient.models.Conversation.create({
        title: defaultTitle,
        participants: [currentUserId],
        personalityMode: normalized,
        experience: normalized,
      });
      
      if (newConversation) {
        const createdId = newConversation.id;
        if (!createdId) {
          console.error('❌ Failed to create conversation: No ID returned');
          return null;
        }

        console.log('✅ Created new conversation:', createdId);
        setConversationId(createdId);
        setPersonalityMode(normalized);
        setAdventureState(null);
        setQuestSteps([]);
        setCharacterState(null);
        setShowCharacterCreation(normalized === 'game_master');
        setConversationListRefreshKey((prev) => prev + 1);
        return createdId;

      } else {
        console.error('❌ Failed to create conversation: No data returned');
        return null;
      }
    } catch (error) {
      console.error('❌ Error creating new conversation:', error);
      return null;
    }
    return null;
  }, [userAttributes]);

  // handleModeSelected removed - mode selection UI removed
  // Keeping setPersonalityMode for compatibility with drag-drop logic

  const handleSidebarDeleteAction = useCallback(async () => {
    if (!conversationId) return;
    setIsOptionsMenuOpen(false);

    try {
      if (!isTestModeEnabled()) {
        await dataClient.models.Conversation.delete({ id: conversationId });
      }

      removeStoredConversationAvatar(conversationId);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(getLastConversationStorageKey(effectivePersonality));
      }
      setIsSelectingConversation(false);
      setConversationId(null);
      setPendingCharacterDraft(null);
      setMessages([]);
      setIsWaitingForResponse(false);
      setAdventureState(null);
      setQuestSteps([]);
      setCharacterState(null);
      setShowCharacterCreation(false);

      setConversationListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }, [conversationId, effectivePersonality]);

  const deleteConversationById = useCallback(async (targetConversationId: string) => {
    if (!targetConversationId) return;

    const deletingActiveConversation = conversationId === targetConversationId;

    try {
      if (!isTestModeEnabled()) {
        await dataClient.models.Conversation.delete({ id: targetConversationId });
      }

      removeStoredConversationAvatar(targetConversationId);

      if (deletingActiveConversation) {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(getLastConversationStorageKey(effectivePersonality));
        }
        setIsSelectingConversation(false);
        setConversationId(null);
        setPendingCharacterDraft(null);
        setMessages([]);
        setIsWaitingForResponse(false);
        setAdventureState(null);
        setQuestSteps([]);
        setCharacterState(null);
        setShowCharacterCreation(false);
      }

      setConversationListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    } finally {
      setDraggingConversationId(null);
      setIsTrashDragOver(false);
    }
  }, [conversationId, effectivePersonality]);

  const handleTrashDragOver = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    if (!draggingConversationId || draggingConversationId === brainConversationId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setIsTrashDragOver(true);
  }, [draggingConversationId, brainConversationId]);

  const handleTrashDragLeave = useCallback(() => {
    setIsTrashDragOver(false);
  }, []);

  const handleTrashDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const droppedConversationId =
      event.dataTransfer.getData('application/x-conversation-id')
      || event.dataTransfer.getData('text/plain')
      || draggingConversationId
      || '';
    if (droppedConversationId) {
      if (droppedConversationId === brainConversationId) {
        setIsTrashDragOver(false);
        setDraggingConversationId(null);
        return;
      }
      void deleteConversationById(droppedConversationId);
    } else {
      setIsTrashDragOver(false);
      setDraggingConversationId(null);
    }
  }, [deleteConversationById, draggingConversationId, brainConversationId]);

  const handleClearBrainChat = async () => {
    if (!conversationId || effectivePersonality !== 'brain') return;
    setIsOptionsMenuOpen(false);
    activeStreamRef.current?.abort();
    chatVoice.stop();
    setBrainClearError(null);

    try {
      if (!isTestModeEnabled()) {
        const revision = crypto.randomUUID();
        const reset = await dataClient.models.Conversation.update({
          id: conversationId,
          brainState: null,
          brainStateVersion: revision,
        });
        if (reset.errors?.length || reset.data?.brainStateVersion !== revision || reset.data.brainState !== null) {
          throw new Error(formatModelErrors(reset.errors) || 'Unable to verify that Brain memory was cleared');
        }
        let responseCursor: string | null | undefined;
        const responseCursors = new Set<string>();
        do {
          const page = await dataClient.models.BrainResponse.list({ filter: { conversationId: { eq: conversationId } }, nextToken: responseCursor });
          if (page.errors?.length) throw new Error(formatModelErrors(page.errors));
          for (const response of page.data ?? []) {
            if (response.id) {
              const deleted = await dataClient.models.BrainResponse.delete({ id: response.id });
              if (deleted.errors?.length) throw new Error(formatModelErrors(deleted.errors));
            }
          }
          responseCursor = page.nextToken;
          if (responseCursor && responseCursors.has(responseCursor)) throw new Error('Response cleanup did not advance');
          if (responseCursor) responseCursors.add(responseCursor);
        } while (responseCursor);

        let messageCursor: string | null | undefined;
        const messageCursors = new Set<string>();
        do {
          const page = await dataClient.models.Message.list({ filter: { conversationId: { eq: conversationId } }, nextToken: messageCursor });
          if (page.errors?.length) throw new Error(formatModelErrors(page.errors));
          for (const message of page.data ?? []) {
            if (message.id) {
              const deleted = await dataClient.models.Message.delete({ id: message.id });
              if (deleted.errors?.length) throw new Error(formatModelErrors(deleted.errors));
            }
          }
          messageCursor = page.nextToken;
          if (messageCursor && messageCursors.has(messageCursor)) throw new Error('Message cleanup did not advance');
          if (messageCursor) messageCursors.add(messageCursor);
        } while (messageCursor);
      }

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(getMessagesCacheKey(conversationId));
      }
      setMessages([]);
      setIsWaitingForResponse(false);
      setConversationListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error clearing chat:', error);
      setBrainClearError('Unable to completely clear Brain chat and memory. Please try again.');
    }
  };


  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const clearLocalAccountData = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.clear();
    window.sessionStorage.clear();
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      if (!isTestModeEnabled()) {
        const result = await dataClient.mutations.deleteAccount();
        if (result.errors?.length) {
          throw new Error(result.errors[0]?.message ?? 'Failed to delete account.');
        }
      }
      clearLocalAccountData();
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteAccountError(
        error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.'
      );
      setIsDeletingAccount(false);
    }
  };

  const handleCharacterCreationComplete = useCallback(async (characterData: CharacterCreationInput) => {
    if (!conversationId) {
      // Character creation is only reachable in Game Master mode, so the
      // conversation must always be created as game_master regardless of the
      // stored personality mode (which can be stale 'brain' after a reload).
      const createdConversationId = await createConversationWithMode('game_master');
      if (!createdConversationId) {
        throw new Error('Unable to create chat');
      }
      setPendingCharacterDraft(null);
      setIsNewInteractionPrimed(false);
      await createCharacter(createdConversationId, characterData);
      setShowCharacterCreation(false);
      // Send opening scene trigger — GM narrates first
      await handleSendMessage(
        `[SYSTEM: Begin the adventure. The player's character is ${characterData.name}, a ${characterData.race} ${characterData.characterClass}. Open with a vivid scene-setting narration that establishes the location, atmosphere, and an immediate hook. Do not wait for the player to speak first.]`,
        createdConversationId,
      );
      return;
    }
    setPendingCharacterDraft(null);
    setIsNewInteractionPrimed(false);
    await createCharacter(conversationId, characterData);
    setShowCharacterCreation(false);
    await handleSendMessage(
      `[SYSTEM: Begin the adventure. The player's character is ${characterData.name}, a ${characterData.race} ${characterData.characterClass}. Open with a vivid scene-setting narration that establishes the location, atmosphere, and an immediate hook. Do not wait for the player to speak first.]`,
      conversationId,
    );
  }, [conversationId, createCharacter, createConversationWithMode, effectivePersonality, handleSendMessage]);

  const handleCharacterCreationCancel = useCallback(async () => {
    if (conversationId) {
      try {
        if (!isTestModeEnabled()) {
          await dataClient.models.Conversation.delete({ id: conversationId });
        }
        removeStoredConversationAvatar(conversationId);
      } catch (error) {
        console.error('Error deleting conversation on cancel:', error);
      }
    }
    setConversationId(null);
    setMessages([]);
    draft.current = '';
    composerRef.current?.clear();
    setIsWaitingForResponse(false);
    setAdventureState(null);
    setQuestSteps([]);
    setCharacterState(null);
    setPendingCharacterDraft(null);
    setShowCharacterCreation(false);
    setConversationListRefreshKey((prev) => prev + 1);
    // Return to the previous conversation (or Brain chat if none)
    const prevId = previousConversationIdRef.current;
    previousConversationIdRef.current = null;
    if (prevId) {
      handleSelectConversation(prevId);
    } else if (brainConversationId) {
      setPersonalityMode('brain');
      handleSelectConversation(brainConversationId);
    } else {
      // Cancellation can happen before the Brain lookup finishes. The route
      // resolves it on the Brain screen rather than stranding an empty draft.
      setPersonalityMode('brain');
    }
  }, [conversationId, brainConversationId]);

  const isGameMasterMode = effectivePersonality === 'game_master';
  const appThemeClass = isGameMasterMode ? 'retro-rpg-ui--gm' : 'retro-rpg-ui--brain';
  const isGameMasterContentLoading = isGameMasterMode && Boolean(conversationId) && (isSelectingConversation || isLoadingCharacter || isLoadingAdventure);
  const hasGameMasterCharacterReady = canShowCharacterContext(characterState, conversationId, showCharacterCreation);
  const showGameMasterCharacterFlow = showCharacterCreation && isGameMasterMode;
  const isGameMasterCharacterRequired = effectivePersonality === 'game_master' && !hasGameMasterCharacterReady;
  const accountEmail = userAttributes?.email?.trim() || 'No email available';
  const isContextOpen = !isGameMasterMode || hasGameMasterCharacterReady;
  const hasTypingMessage = messages.some(m => m.isTyping);
  const isInputLocked = isWaitingForResponse || hasTypingMessage || hasPendingRoll || isGameMasterContentLoading || isGameMasterCharacterRequired || isSelectingConversation;
  const gameMasterInputPlaceholder = 'What do you do next?';

  const normalizedQuestSteps = useMemo(() => mapQuestStepsToHud(questSteps), [questSteps]);

  const derivedQuestSteps = useMemo(() => {
    if (normalizedQuestSteps.length > 0 || effectivePersonality !== 'game_master') return [];
    return deriveHudQuestStepsFromMessages(messages);
  }, [normalizedQuestSteps, messages, effectivePersonality]);

  const hudQuestSteps = normalizedQuestSteps.length > 0 ? normalizedQuestSteps : derivedQuestSteps;
  const characterDisplay = useMemo(() => getCharacterData(), [getCharacterData]);
  const currentLocation = useMemo(() => {
    // Authoritative, placeholder-proof: set only from STATE_SNAPSHOT / real rows.
    if (authoritativeLocation) return authoritativeLocation;

    const PLACEHOLDER = /^(unknown|unknown location|n\/a|none|null|undefined)$/i;
    const isValid = (v: string | null | undefined): v is string =>
      typeof v === 'string' && v.trim().length > 0 && !PLACEHOLDER.test(v.trim());

    if (isValid(adventureState?.currentLocation)) {
      const resolved = resolveLocationName(adventureState!.currentLocation);
      if (resolved && resolved !== GM_PLACEHOLDER_LOCATION) return resolved;
    }
    if (isValid(adventureState?.lastLocation)) {
      const resolved = resolveLocationName(adventureState!.lastLocation);
      if (resolved && resolved !== GM_PLACEHOLDER_LOCATION) return resolved;
    }
    return undefined;
  }, [authoritativeLocation, adventureState?.currentLocation, adventureState?.lastLocation]);
  
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && Boolean(message.content || message.fullContent)),
    [messages],
  );
  const brainPresenceIntensity = useMemo(() => {
    const sensationCount = latestAssistantMessage?.sensations?.length ?? 0;
    const thoughtCount = latestAssistantMessage?.thoughts?.length ?? 0;
    return Math.min(100, 25 + sensationCount * 14 + thoughtCount * 8 + (isWaitingForResponse ? 12 : 0));
  }, [isWaitingForResponse, latestAssistantMessage]);
  // Brain's rail presence mirrors the live conversation instead of a timer.
  const brainPresenceMood: BrainPresenceMood = !conversationId
    ? 'idle'
    : isWaitingForResponse
      ? 'thinking'
      : hasTypingMessage
        ? 'speaking'
        : 'listening';
  const composer = <ChatComposer ref={composerRef} draft={draft} onSend={handleSubmit}
    isGameMasterMode={isGameMasterMode}
    isLocked={isInputLocked || isSelectingConversation} isWaiting={isWaitingForResponse} isPrimed={isNewInteractionPrimed}
    placeholder={hasPendingRoll ? 'Resolve the requested check above…' : conversationId
      ? (isGameMasterMode ? gameMasterInputPlaceholder : 'Message Brain…')
      : (isGameMasterMode ? gameMasterInputPlaceholder : isNewInteractionPrimed ? 'New chat ready. Start typing…' : 'Start a new conversation…')} />;
  const jumpToLatest = !isAtBottom && <button type="button" className="cosmic-jump-to-latest" onClick={scrollToLatest}>Latest messages <span aria-hidden="true">↓</span></button>;
  const welcome = messages.length === 0 && !isWaitingForResponse && (
    !userAttributes || isSelectingConversation
      ? null
      : <ChatWelcome isGameMasterMode={isGameMasterMode} isSettingUp={showGameMasterCharacterFlow || isGameMasterCharacterRequired}
        onPrompt={prompt => { composerRef.current?.clear(); composerRef.current?.append(prompt); composerRef.current?.focus(); }} />
  );

  return (
    <div className={`retro-rpg-ui cosmic-workspace ${appThemeClass} h-dvh overflow-hidden relative`}>

      {/* Workspace operation error toast. */}
      {(playerStateError || brainClearError) && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-brand-surface-elevated border border-brand-surface-border px-4 py-3 shadow-lg text-sm text-brand-text-secondary">
          <span>{brainClearError || playerStateError}</span>
          <button
            type="button"
            onClick={() => { setPlayerStateError(null); setBrainClearError(null); }}
            className="ml-2 text-brand-text-muted hover:text-brand-text-primary transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop: Main Layout */}
      {isDesktop ? <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 grid retro-shell" data-context-open={isContextOpen}>
        {/* Left Sidebar - full height */}
        <aside className="retro-shell-left">
          <div className="retro-left-container retro-left-panel-icon-only relative flex h-full flex-col overflow-visible px-3">
                <div className="flex h-full flex-col items-center gap-5 pt-4 pb-[calc(var(--site-footer-height)+1rem)]">
                  <ConversationSidebarIcons
                    onSelectConversation={handleSelectConversation}
                    onSelectBrain={() => {
                      if (brainConversationId) {
                        setPersonalityMode('brain');
                        handleSelectConversation(brainConversationId);
                      }
                    }}
                    onNewConversation={handleNewConversation}
                    activeConversationId={conversationId === brainConversationId ? 'brain' : conversationId}
                    refreshKey={conversationListRefreshKey}
                    isDisabled={isWaitingForResponse || isSelectingConversation}
                  />

                  {/* Settings pinned to the foot of the rail, clear of the credit pill */}
                  <div ref={optionsMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                      onDragOver={handleTrashDragOver}
                      onDragLeave={handleTrashDragLeave}
                      onDrop={handleTrashDrop}
                      className={`cosmic-rail-control retro-icon-button h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-200 ${
                        isOptionsMenuOpen || isTrashDragOver
                          ? isTrashDragOver
                            ? 'border-brand-status-error/70 bg-brand-status-error/28 text-brand-status-error scale-[1.16] shadow-[0_12px_26px_rgba(239,68,68,0.34)]'
                            : 'border-brand-accent-primary/65 bg-brand-accent-primary/18 text-brand-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                          : 'border-brand-surface-border/50 bg-brand-surface-secondary/60 text-brand-text-primary hover:border-brand-surface-border/70 hover:bg-brand-surface-elevated/70'
                      }`}
                      aria-label="Options"
                      aria-expanded={isOptionsMenuOpen}
                      aria-controls="desktop-options-menu"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="3" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>

                    {isOptionsMenuOpen && (
                        <div
                          id="desktop-options-menu"
                          role="dialog"
                          aria-label="Options"
                          className="retro-dropdown cosmic-desktop-menu absolute bottom-full left-0 z-[90] mb-2 rounded-xl border shadow-glass-lg backdrop-blur-xl"
                          onKeyDown={event => {
                            if (event.key === 'Escape') {
                              setIsOptionsMenuOpen(false);
                              optionsMenuRef.current?.querySelector<HTMLButtonElement>('[aria-controls="desktop-options-menu"]')?.focus();
                            }
                          }}
                        >
                          <OptionsMenuContent email={accountEmail}
                            onSignOut={handleSignOut} onDeleteAccount={() => {
                              setIsOptionsMenuOpen(false);
                              setIsDeleteAccountModalOpen(true);
                            }}
                            conversationAction={
                              <button type="button" className="cosmic-menu-row"
                                onClick={() => { if (isGameMasterMode) void handleSidebarDeleteAction(); else void handleClearBrainChat(); }}
                                disabled={!conversationId || (!isGameMasterMode && messages.length === 0)}>
                                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {isGameMasterMode ? 'Delete current chat' : 'Clear chat'}
                              </button>
                            } />
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

          <main 
            className="retro-shell-center retro-main flex flex-col min-w-0 overflow-hidden relative px-4 pb-4 pt-4"
          >
          <header className="cosmic-workspace-header">
            <div className="cosmic-header-content">
            <h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1>
            <ChatVoiceControl enabled={chatVoice.enabled} status={chatVoice.status} error={chatVoice.error} onToggle={chatVoice.toggle} />
            </div>
          </header>
          {/* Screen reader live region for message updates */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {isWaitingForResponse && 'AI is thinking...'}
            {messages.length > 0 && `Chat has ${messages.length} messages`}
          </div>

          <div className="retro-center-container flex-1 min-h-0">
              <section className="retro-chat-pane min-w-0 h-full min-h-0 flex flex-col overflow-hidden">
                <div className="retro-chat-isolated-window flex-1 min-h-0 overflow-hidden flex flex-col">
                        <div className="cosmic-chat-viewport">
                        <div
                          ref={scrollRef}
                          className="cosmic-chat-scroll flex-1 overflow-y-auto pr-2"
                        >
                          <div ref={contentRef} className="cosmic-chat-content mx-auto max-w-4xl space-y-6 flex flex-col">
                          {/* Mode indicator removed */}

                        {conversationId && isGameMasterMode && hasGameMasterCharacterReady && adventureState && (
                            <div className="lg:hidden cosmic-fade-in">
                              <GameMasterHud
                                adventure={adventureState}
                                questSteps={hudQuestSteps}
                                character={characterState}
                                onUpdateInventory={updateInventory}
                              />
                            </div>
                          )}
              
              {welcome}
              <MessageList key={conversationId} messages={messages} isGameMasterMode={isGameMasterMode} variant="desktop"
                onListen={chatVoice.listen}
                activeDiceRequestId={activeDiceRequestId} diceDisabled={diceBusy} onDiceRoll={handleDiceRoll} />
              
              
                  
                          <div aria-hidden="true" />
                        </div>
                      </div>
                      </div>
                    </div>
                      <BottomInput className="px-0 pt-3 shrink-0">
                        <div className="relative mx-auto max-w-4xl">
                          {jumpToLatest}
                          {composer}
                        </div>
                      </BottomInput>
                  </section>
</div>
      </main>

          {isContextOpen && <aside className="retro-shell-right" aria-label={isGameMasterMode ? 'Game context' : 'Brain context'}>
          <div className="retro-right-container flex h-full min-h-0 flex-col overflow-hidden">
                {isGameMasterMode ? (
                characterDisplay ? (
                      <div className="retro-right-stack cosmic-fade-in flex h-full min-h-0 flex-col p-5">
                        {/* Tabs pin; character and timeline content scroll beneath. */}
                        <ContextWindowPanel
                          playerState={playerState ? {
                            currentLevel: playerState.currentLevel ?? undefined,
                            currentXP: playerState.currentXP ?? undefined,
                            xpToNextLevel: playerState.xpToNextLevel ?? undefined,
                            currentAreaId: playerState.currentAreaId ?? undefined,
                            lastKnownLocation: playerState.lastKnownLocation ?? undefined,
                            diceRollLog: playerState.diceRollLog as any ?? undefined,
                            pendingDiceRoll: playerState.pendingDiceRoll ?? undefined,
                          } : undefined}
                          character={characterDisplay ? {
                            name: characterDisplay.name,
                            level: characterDisplay.level,
                            currentHP: characterDisplay.hp.current,
                            maxHP: characterDisplay.hp.max,
                            stats: characterDisplay.stats,
                            avatarSrc: characterDisplay.avatarSrc,
                            avatarSrcWebp: characterDisplay.avatarSrcWebp,
                          } : undefined}
                          currentLocation={currentLocation}
                      activeQuests={activeQuests}
                          timelineEntries={messages
                            .filter(m => !m.content?.startsWith('[SYSTEM:'))
                            .map((m, i) => ({
                            id: String(i),
                            role: m.role,
                            content: m.content ?? m.fullContent,
                            sensations: m.sensations,
                            thoughts: m.thoughts,
                            location: currentLocation ?? undefined,
                          }))}
                        >
                          {characterDisplay ? (
                            <div className="retro-right-section retro-right-section--inventory">
                              <InventoryManager
                                inventory={characterDisplay.inventory}
                                onUpdateInventory={updateInventory}
                                isUpdating={false}
                              />
                            </div>
                          ) : null}
                        </ContextWindowPanel>
                      </div>
                    ) : null
              ) : (
                <BrainPresence mood={brainPresenceMood} intensity={brainPresenceIntensity} />
              )}
          </div>
          </aside>}
        </div>
      </div> : <main
        className="retro-mobile-main flex flex-col h-full px-2 pb-2 pt-2"
      >
        {/* Mobile Top Nav Bar */}
        <nav className="retro-nav retro-mobile-nav sticky top-0 z-[60] bg-brand-surface-elevated/95 backdrop-blur-xl border-b border-brand-surface-border/50 shadow-lg pt-safe rounded-3xl">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="rounded-xl p-2 text-brand-text-primary hover:bg-brand-surface-secondary/60 transition-colors"
                  aria-label="Open menu"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1>
              </div>
              <ChatVoiceControl enabled={chatVoice.enabled} status={chatVoice.status} error={chatVoice.error} onToggle={chatVoice.toggle} />
            </div>

            <div>
              {/* Mode selection belongs to the global menu, not the header. */}
            </div>
          </div>
        </nav>

        {/* Game information is unavailable until this conversation's character
            has been saved and the creation flow has finished. */}
        {isGameMasterMode && hasGameMasterCharacterReady && (
          <div className="retro-mobile-bars cosmic-fade-in lg:hidden sticky top-0 z-40 pt-safe">
            <div className="flex gap-2 mx-4 mt-4 items-start">
              {/* First Bar - Quest Log */}
              <div className="flex-1 relative">
                <div 
                  className={`retro-mobile-card rounded-2xl bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
                    mobileInfoExpanded ? 'absolute top-0 left-0 w-auto min-w-full max-w-md z-50' : ''
                  }`}
                >
                  {/* Collapsed Header Bar */}
                  <button
                    onClick={() => setMobileInfoExpanded(!mobileInfoExpanded)}
                    aria-expanded={mobileInfoExpanded}
                    className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-brand-text-muted uppercase tracking-wider">
                      Quest Log
                        </p>
                        <p className="text-sm text-brand-text-primary font-medium truncate">
                          {activeQuests[0]?.title ?? 'No active quest'}
                        </p>
                      </div>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-brand-text-muted transition-transform duration-300 flex-shrink-0 ${
                        mobileInfoExpanded ? 'rotate-180' : ''
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded Quest Log Content */}
                  {mobileInfoExpanded && (
                    <div className="px-4 pb-4 space-y-4 animate-slide-up border-t border-brand-surface-border/30 pt-4">
                      <QuestLogPanel quests={activeQuests} />
                    </div>
                  )}
                </div>
              </div>

              {/* Second Bar - Character Sheet (D&D style) */}
              <div className="flex-1 relative">
                <div 
                  className={`retro-mobile-card rounded-2xl bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
                    mobileCharSheetExpanded && characterDisplay ? 'absolute top-0 left-0 w-auto min-w-full max-w-md z-50' : ''
                  }`}
                >
                  <button
                    onClick={() => {
                      if (!characterDisplay) return;
                      setMobileCharSheetExpanded(!mobileCharSheetExpanded);
                    }}
                    aria-expanded={mobileCharSheetExpanded && Boolean(characterDisplay)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none"
                  >
                    <div className="retro-character-identity retro-character-identity--compact flex items-center gap-3 min-w-0">
                      {characterDisplay?.avatarSrc ? (
                        <div className="retro-character-avatar-wrap">
                          <picture>
                            <source srcSet={characterDisplay.avatarSrcWebp} type="image/webp" />
                            <img
                              src={characterDisplay.avatarSrc}
                              alt={`${characterDisplay.name} avatar`}
                              loading="lazy"
                              decoding="async"
                              className="retro-character-avatar retro-character-avatar--compact w-10 h-10 rounded-lg object-cover object-center flex-shrink-0"
                            />
                          </picture>
                        </div>
                      ) : (
                        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-brand-surface-secondary/50" aria-hidden="true" />
                      )}
                      <div className="retro-character-meta retro-character-meta--compact min-w-0 flex-1">
                        <p className="text-xs text-brand-text-muted uppercase tracking-wider">Character</p>
                        <p className="text-sm text-brand-text-primary font-medium truncate">{characterDisplay?.name ?? 'Not created'}</p>
                      </div>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-brand-text-muted transition-transform duration-300 flex-shrink-0 ${
                        mobileCharSheetExpanded && characterDisplay ? 'rotate-180' : ''
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded Character Sheet Content */}
                  {mobileCharSheetExpanded && characterState && characterDisplay && (() => {
                    const charData = characterDisplay;
                    return (
                      <div className="px-4 pb-4 space-y-3 animate-slide-up border-t border-brand-surface-border/30 pt-4">
                        {/* Stats */}
                        <div>
                          <h4 className="text-xs uppercase tracking-wider text-brand-text-muted mb-2">Attributes</h4>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">STR</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.strength}</div>
                            </div>
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">DEX</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.dexterity}</div>
                            </div>
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">CON</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.constitution}</div>
                            </div>
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">INT</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.intelligence}</div>
                            </div>
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">WIS</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.wisdom}</div>
                            </div>
                            <div className="bg-brand-surface-hover rounded-lg p-2 text-center">
                              <div className="text-xs text-brand-text-muted">CHA</div>
                              <div className="text-lg font-bold text-brand-text-primary">{charData.stats.charisma}</div>
                            </div>
                          </div>
                        </div>

                        {/* Health & Level */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-wider text-brand-text-muted">Level</span>
                            <span className="text-sm font-bold text-brand-text-primary">{charData.level}</span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs uppercase tracking-wider text-brand-text-muted">HP</span>
                              <span className="text-xs text-brand-text-secondary">{charData.hp.current} / {charData.hp.max}</span>
                            </div>
                            <div className="h-2 bg-brand-surface-hover rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${charData.hp.percentage}%` }}></div>
                            </div>
                          </div>
                        </div>

                        {/* Inventory */}
                        <InventoryManager 
                          inventory={charData.inventory}
                          onUpdateInventory={updateInventory}
                          isUpdating={false}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Screen reader live region for message updates */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {isWaitingForResponse && 'AI is thinking...'}
          {messages.length > 0 && `Chat has ${messages.length} messages`}
        </div>

        {/* Enhanced Chat Area with glass morphism design */}
        <div className="retro-chat-area flex-1 flex flex-col min-h-0 mt-2">
          {/* Messages with improved styling and animations */}
          <div className="cosmic-chat-viewport">
          <div
            ref={scrollRef}
            className="retro-scroll-panel cosmic-chat-scroll flex-1 overflow-y-auto px-3 py-5 pb-3 flex flex-col rounded-3xl"
          >
            <div ref={contentRef} className="cosmic-chat-content w-full max-w-4xl mx-auto space-y-4 flex flex-col">
                {welcome}
              <MessageList key={conversationId} messages={messages} isGameMasterMode={isGameMasterMode} variant="mobile"
                onListen={chatVoice.listen}
                activeDiceRequestId={activeDiceRequestId} diceDisabled={diceBusy} onDiceRoll={handleDiceRoll} />
              
              
              <div aria-hidden="true" />
            </div>
          </div>
          </div>

          {/* Mobile Input Area */}
            <div className="retro-input-dock pt-3 pb-3 px-3 pb-safe">
              <div className="relative max-w-4xl mx-auto">
                {jumpToLatest}
                {composer}
              </div>
            </div>
        </div>

      </main>}

      {showGameMasterCharacterFlow && <CharacterCreation
        onComplete={handleCharacterCreationComplete}
        onCancel={handleCharacterCreationCancel}
      />}

      {/* Mobile Menu Drawer */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        activeConversationId={conversationId === brainConversationId ? 'brain' : conversationId}
        conversationId={conversationId}
        effectivePersonality={effectivePersonality}
        messagesCount={messages.length}
        email={accountEmail}
        onSelectBrain={() => {
          setIsMobileMenuOpen(false);
          if (brainConversationId) {
            setPersonalityMode('brain');
            void handleSelectConversation(brainConversationId);
          }
        }}
        onSelectConversation={(id) => { void handleSelectConversation(id); }}
        onNewConversation={() => { void handleNewConversation(); }}
        onSignOut={handleSignOut}
        onDeleteCurrent={() => { void handleSidebarDeleteAction(); }}
        onClearChat={() => { void handleClearBrainChat(); }}
        onDeleteAccount={() => {
          setIsOptionsMenuOpen(false);
          setIsMobileMenuOpen(false);
          setIsDeleteAccountModalOpen(true);
        }}
      />

      {/* Install Prompt */}
      <InstallPrompt />

      <DeleteAccountModal
        isOpen={isDeleteAccountModalOpen}
        isDeleting={isDeletingAccount}
        error={deleteAccountError}
        onClose={() => setIsDeleteAccountModalOpen(false)}
        onConfirm={() => { void handleDeleteAccount(); }}
      />

    </div>
  );
}

export default App;
