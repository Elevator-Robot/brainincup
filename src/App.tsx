import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import InstallPrompt from './components/InstallPrompt';
import CharacterCreation from './components/CharacterCreation';
import ConversationSidebarIcons from './components/ConversationSidebarIcons';
import InventoryManager, { type InventoryItem } from './components/InventoryManager';
import TroubleDice3D from './components/TroubleDice3D';
// import Panel from './components/ui/Panel';
import { BottomInput } from './components/ui/RPGLayout';
import ContextWindowPanel from './components/ContextWindowPanel';
import type { GameEvent } from './hooks/useContextPanel';
import { normalizePersonalityMode } from './constants/personalityModes';
import type { PersonalityModeId } from './constants/personalityModes';
import {
  chooseAutoAvatarId,
  getAvatarOptionById,
} from './constants/gameMasterAvatars';
import { isTestModeEnabled } from './utils/testMode';
import { streamAgentMessage, type AguiEvent } from './utils/aguiStream';
import { MessageBubble, type Message } from './components/MessageBubble';
const dataClient = generateClient<Schema>();

type AdventureRecord = Schema['GameMasterAdventure']['type'];
type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
type CharacterRecord = Schema['GameMasterCharacter']['type'];
type CharacterCreationInput = {
  name: string;
  race: string;
  characterClass: string;
  avatarId: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};

type DiceRollResult = {
  value: number;
  sides: number;
};

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
  isLoadingCharacter?: boolean;
  onUpdateInventory?: (newInventory: InventoryItem[]) => Promise<void>;
}

function GameMasterHud({ adventure, questSteps, character, isLoadingCharacter, onUpdateInventory }: GameMasterHudProps) {
  const latestStep = questSteps.slice(-1)[0];
  
  // Don't show placeholder data while loading
  if (isLoadingCharacter || !character) {
    return (
      <div className="animate-slide-up w-full space-y-6">
        <div className="w-full p-5 rounded-lg">
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="h-6 bg-brand-surface-hover rounded w-3/4"></div>
            <div className="h-4 bg-brand-surface-hover rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }
  
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

function App() {
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  // Initialize both conversationId and personality mode from localStorage synchronously
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('lastActiveConversationId');
  });
  const [storedPersonalityMode, setStoredPersonalityMode] = useState<'brain' | 'game_master'>(() => {
    if (typeof window === 'undefined') return 'game_master';
    return (localStorage.getItem('lastPersonalityMode') as 'brain' | 'game_master') || 'game_master';
  });
  const [brainConversationId, setBrainConversationId] = useState<string | null>(null);

  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(() =>
    readStoredBoolean(UI_MOBILE_INFO_EXPANDED_KEY, false)
  );
  const [mobileCharSheetExpanded, setMobileCharSheetExpanded] = useState(() =>
    readStoredBoolean(UI_MOBILE_CHARACTER_EXPANDED_KEY, false)
  );
  const [expandedMessageIndex, setExpandedMessageIndex] = useState<number | null>(null); // Track which message's details are shown
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [conversationListRefreshKey, setConversationListRefreshKey] = useState(0);
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const [isNewInteractionPrimed, setIsNewInteractionPrimed] = useState(false);
  const [pendingCharacterDraft, setPendingCharacterDraft] = useState<CharacterCreationInput | null>(null);
  const [lastManualDiceRoll, setLastManualDiceRoll] = useState<DiceRollResult | null>(null);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [diceRollPulseId, setDiceRollPulseId] = useState(0);
  const [diceRollNonce, setDiceRollNonce] = useState(0);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);

  // PlayerState — authoritative game state synced via AppSync subscription
  type PlayerStateRecord = Schema['PlayerState']['type'];
  const [playerState, setPlayerState] = useState<PlayerStateRecord | null>(null);
  // Optimistic snapshot: last confirmed state used for rollback
  const confirmedPlayerStateRef = useRef<PlayerStateRecord | null>(null);
  const optimisticRollbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task 11.4 — tracks the last requestId that triggered the dice animation to avoid re-triggering
  const lastTriggeredDiceRequestIdRef = useRef<string | null>(null);

  // Error toast state for optimistic rollback notifications
  const [playerStateError, setPlayerStateError] = useState<string | null>(null);
  
  // Game Master data state
  const [adventureState, setAdventureState] = useState<AdventureRecord | null>(null);
  const [questSteps, setQuestSteps] = useState<QuestStepRecord[]>([]);
  const [characterState, setCharacterState] = useState<CharacterRecord | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false);
  const [isLoadingAdventure, setIsLoadingAdventure] = useState(false);
  const [isSelectingConversation, setIsSelectingConversation] = useState(false);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
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
    const avatarId = getAvatarOptionById(characterState.avatarId ?? '')?.id
      ?? getAvatarOptionById(getStoredConversationAvatarId(conversationId))?.id
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
    // If we have a brainConversationId and it matches, we're in brain mode
    if (brainConversationId && conversationId === brainConversationId) {
      return 'brain';
    }
    // If we have a conversationId but brainConversationId isn't set yet, use stored mode
    if (conversationId && !brainConversationId) {
      return storedPersonalityMode;
    }
    // Default to game_master
    return 'game_master';
  }, [conversationId, brainConversationId, storedPersonalityMode]);
  const setPersonalityMode = (mode: PersonalityModeId) => {
    setStoredPersonalityMode(mode);
    localStorage.setItem('lastPersonalityMode', mode);
    if (mode === 'brain' && brainConversationId) {
      setConversationId(brainConversationId);
    }
  };

  const ensureAdventureState = useCallback(async (convId: string, modeOverride?: string): Promise<AdventureRecord | null> => {
    const activeMode = normalizePersonalityMode(modeOverride ?? effectivePersonality);
    if (activeMode !== 'game_master') return null;
    try {
      const { data } = await dataClient.models.GameMasterAdventure.list({
        filter: { conversationId: { eq: convId } },
        limit: 1,
        authMode: 'userPool',
      });
      let adventure: AdventureRecord | null = data?.[0] ? (data[0] as AdventureRecord) : null;
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
      }
      if (adventure) {
        setAdventureState(adventure);
      }
      return adventure;
    } catch (error) {
      console.error('Error ensuring Game Master adventure state:', error);
      return null;
    }
  }, [effectivePersonality]);

  const findCharacterByConversation = useCallback(async (convId: string): Promise<CharacterRecord | null> => {
    const findMatch = (items: CharacterRecord[] | null | undefined): CharacterRecord | null =>
      (items ?? []).find((character) => character?.conversationId === convId) ?? null;

    try {
      const filteredResult = await dataClient.models.GameMasterCharacter.list({
        filter: { conversationId: { eq: convId } },
        limit: 1,
        authMode: 'userPool',
      });
      const directMatch = findMatch(filteredResult.data as CharacterRecord[] | undefined);
      if (directMatch) {
        return directMatch;
      }
    } catch (filterError) {
      console.warn('Filtered character lookup failed, using paginated fallback:', filterError);
    }

    const fetchPaginated = async (authMode?: 'userPool'): Promise<CharacterRecord | null> => {
      const pageLimit = 50;
      const maxPages = 6;
      let cursor: string | null | undefined = undefined;

      for (let page = 0; page < maxPages; page += 1) {
        const pageResult: { data?: CharacterRecord[]; nextToken?: string | null } = authMode
          ? await dataClient.models.GameMasterCharacter.list({
            limit: pageLimit,
            nextToken: cursor ?? undefined,
            authMode,
          })
          : await dataClient.models.GameMasterCharacter.list({
            limit: pageLimit,
            nextToken: cursor ?? undefined,
          });

        const match = findMatch(pageResult.data as CharacterRecord[] | undefined);
        if (match) {
          return match;
        }

        cursor = pageResult.nextToken;
        if (!cursor) {
          break;
        }
      }

      return null;
    };

    try {
      return await fetchPaginated('userPool');
    } catch (authError) {
      console.warn('User pool character pagination failed, retrying default auth mode:', authError);
      return fetchPaginated();
    }
  }, []);

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
      setShowCharacterCreation(true);
      return null;
    } catch (error) {
      console.error('❌ Error loading character:', error);
      characterCreationLock.current = false;
      return null;
    } finally {
      setIsLoadingCharacter(false);
    }
  }, [characterState, findCharacterByConversation]);

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
      const createdWithAvatar = await dataClient.models.GameMasterCharacter.create({
        ...baseCharacterPayload,
        ...(avatarId ? { avatarId } : {}),
      });
      let created = createdWithAvatar;

      if (!createdWithAvatar.data) {
        console.warn('Primary character create failed; retrying without avatarId.', createdWithAvatar.errors);
        created = await dataClient.models.GameMasterCharacter.create(baseCharacterPayload);
      }
      
      if (created.data) {
        const createdAvatarId = getAvatarOptionById(avatarId)?.id ?? '';
        setCharacterState(createdAvatarId ? { ...(created.data as CharacterRecord), avatarId: createdAvatarId } : (created.data as CharacterRecord));
        if (createdAvatarId) {
          writeStoredConversationAvatar(convId, createdAvatarId);
        }
        const conversationTitle = (characterData.name || '').trim();
        if (conversationTitle) {
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
        setShowCharacterCreation(false);
        // Small delay to ensure database write propagates
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (created.errors) {
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
  }, []);

  const updateInventory = useCallback(async (newInventory: InventoryItem[]) => {
    if (!characterState?.id) {
      throw new Error('No character loaded');
    }
    
    // Optimistic update
    const previousInventory = characterState.inventory;
    setCharacterState(prev => prev ? { ...prev, inventory: JSON.stringify(newInventory) } : prev);
    
    try {
      await dataClient.models.GameMasterCharacter.update({
        id: characterState.id,
        inventory: JSON.stringify(newInventory),
      });
    } catch (error) {
      // Rollback on error
      setCharacterState(prev => prev ? { ...prev, inventory: previousInventory } : prev);
      throw error;
    }
  }, [characterState]);

  const fetchAdventureBundle = useCallback(async (convId: string, modeOverride?: string) => {
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
        fetchCharacter(convId),
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
        const stepsRes = await dataClient.models.GameMasterQuestStep.list({
          filter: { adventureId: { eq: adventureId } },
          limit: 200,
        });
        const steps = ((stepsRes.data ?? []).filter(Boolean) as QuestStepRecord[])
          .sort((a, b) => ((a?.createdAt ?? '') < (b?.createdAt ?? '') ? -1 : 1));
        setQuestSteps(steps);
      } catch (error) {
        console.error('Error loading Game Master data:', error);
      }
    } finally {
      adventureFetchLock.current = null;
      setIsLoadingAdventure(false);
    }
  }, [effectivePersonality, ensureAdventureState, fetchCharacter]);

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
        locationTag: adventure.lastLocation ?? '',
        createdAt: new Date().toISOString(),
      });
      const questStep = (created.data as QuestStepRecord | null) ?? null;
      if (questStep) {
        setQuestSteps(prev => [...prev, questStep]);
        await dataClient.models.GameMasterAdventure.update({
          id: adventure.id!,
          lastStepId: questStep.id,
          updatedAt: new Date().toISOString(),
        });
        setAdventureState((prev: AdventureRecord | null) => (prev ? { ...prev, lastStepId: questStep.id } : prev));
      }
    } catch (error) {
      console.error('Error recording quest step:', error);
    }
  }, [conversationId, effectivePersonality, ensureAdventureState]);

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

  // Scroll to bottom when messages are loaded
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);


  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const newInteractionPrimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map()); // Track individual message container refs (bubble + details)
  const desktopScrollContainerRef = useRef<HTMLDivElement>(null); // Desktop scroll container
  const desktopContentRef = useRef<HTMLDivElement>(null); // Desktop chat content (observed for growth)
  const mobileScrollContainerRef = useRef<HTMLDivElement>(null); // Mobile scroll container
  const mobileContentRef = useRef<HTMLDivElement>(null); // Mobile chat content (observed for growth)
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const streamedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node;
      const clickedProfileDropdown = profileMenuRef.current?.contains(target);
      if (!clickedProfileDropdown) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isProfileMenuOpen]);

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

  // Mode persistence removed - mode is now hardcoded to game_master

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

  // On mount: if we have a stored conversationId (from localStorage init), load its data.
  // If not, wait for Brain conversation to be ready and load that.
  const initialLoadDoneRef = useRef(false);
  const previousConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userAttributes || initialLoadDoneRef.current) return;

    async function loadInitialConversation() {
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
  }, [userAttributes, conversationId, brainConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure scroll to bottom on initial load and page refresh
  useEffect(() => {
    if (conversationId && messages.length > 0 && messagesEndRef.current) {
      // Multiple attempts to ensure scroll happens after render
      const attemptScroll = () => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
      };
      
      attemptScroll();
      requestAnimationFrame(attemptScroll);
      setTimeout(attemptScroll, 100);
      setTimeout(attemptScroll, 300);
    }
  }, [conversationId, messages.length]);

  // Auto-scroll to bottom when expanded message details change
  useEffect(() => {
    if (expandedMessageIndex !== null) {
      const containerElement = messageContainerRefs.current.get(expandedMessageIndex);
      if (!containerElement) return;

      const bubbleElement = containerElement.querySelector('.message-bubble') as HTMLElement;
      if (!bubbleElement) return;

      const scrollContainer = bubbleElement.closest('.overflow-y-auto') as HTMLElement;
      if (!scrollContainer) return;

      // Function to ensure bubble stays visible
      const ensureBubbleVisible = () => {
        const bubbleRect = bubbleElement.getBoundingClientRect();
        const scrollRect = scrollContainer.getBoundingClientRect();
        
        const bubbleTop = bubbleRect.top;
        const scrollTop = scrollRect.top;
        const isAboveViewport = bubbleTop < scrollTop + 60;
        
        if (isAboveViewport) {
          bubbleElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest' 
          });
        }
      };

      // Run once immediately
      ensureBubbleVisible();

      // Use ResizeObserver to detect when the container size changes due to expansion
      const resizeObserver = new ResizeObserver(ensureBubbleVisible);
      resizeObserver.observe(containerElement);

      // Cleanup
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [expandedMessageIndex]);

  // Scroll desktop container to bottom when messages load
  useEffect(() => {
    if (desktopScrollContainerRef.current && messages.length > 0) {
      desktopScrollContainerRef.current.scrollTop = desktopScrollContainerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Keep the chat pinned to the bottom while content grows — streamed deltas,
  // the typewriter reveal, expanded details, and new messages — so the user
  // never has to scroll to follow the conversation. Pinning pauses while the
  // user scrolls up and resumes once they return near the bottom.
  useEffect(() => {
    const containers: Array<{ scroll: HTMLDivElement; content: HTMLDivElement }> = [];
    if (desktopScrollContainerRef.current && desktopContentRef.current) {
      containers.push({ scroll: desktopScrollContainerRef.current, content: desktopContentRef.current });
    }
    if (mobileScrollContainerRef.current && mobileContentRef.current) {
      containers.push({ scroll: mobileScrollContainerRef.current, content: mobileContentRef.current });
    }
    if (containers.length === 0) return;

    const pinned = new Map<HTMLDivElement, boolean>();
    const observers: ResizeObserver[] = [];
    const removeListeners: Array<() => void> = [];

    for (const { scroll, content } of containers) {
      pinned.set(scroll, true);
      const onScroll = () => {
        pinned.set(scroll, scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 100);
      };
      scroll.addEventListener('scroll', onScroll, { passive: true });
      removeListeners.push(() => scroll.removeEventListener('scroll', onScroll));

      const observer = new ResizeObserver(() => {
        if (pinned.get(scroll)) {
          scroll.scrollTop = scroll.scrollHeight;
        }
      });
      observer.observe(content);
      observers.push(observer);
    }

    return () => {
      removeListeners.forEach(remove => remove());
      observers.forEach(observer => observer.disconnect());
    };
  }, []);

  // Cleanup typing animation when conversation changes or component unmounts
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

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

              console.log('✅ MATCH: Starting typing animation for response:', brainResponse.response);
              console.log('✅ MATCH: Including metadata - sensations:', brainResponse.sensations, 'thoughts:', brainResponse.thoughts);

              // Add empty assistant message to start typing animation
              setMessages(prev => {
                const newMessages: Message[] = [...prev, { 
                  role: 'assistant' as const, 
                  content: '',
                  isTyping: true,
                  fullContent: brainResponse.response ?? '',
                  sensations: brainResponse.sensations?.filter((s): s is string => s !== null) || [],
                  thoughts: brainResponse.thoughts?.filter((t): t is string => t !== null) || [],
                  memories: brainResponse.memories || '',
                  selfReflection: brainResponse.selfReflection || '',
                }];
                
                console.log('Message being added:', newMessages[newMessages.length - 1]);
                
                // Start typing animation for the newly added message
                const messageIndex = newMessages.length - 1;
                setTimeout(() => {
                  startTypingAnimation(messageIndex, brainResponse.response ?? '');
                }, 100); // Small delay to ensure state is updated
                
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
  }, [conversationId, effectivePersonality, recordQuestStep]);

  // Task 11.1 — PlayerState AppSync subscription
  // Subscribes to PlayerState records for the active conversation and keeps local
  // playerState in sync with authoritative DynamoDB values.
  useEffect(() => {
    if (!conversationId || effectivePersonality !== 'game_master') return;

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

          // Task 11.4 — wire pendingDiceRoll to dice animation
          // Guard: only trigger if there is a non-expired, not-yet-triggered request.
          const pending = latest.pendingDiceRoll as
            | { requestId?: string; expiresAt?: string }
            | null
            | undefined;
          if (pending?.requestId) {
            const isExpired = pending.expiresAt
              ? new Date(pending.expiresAt).getTime() < Date.now()
              : false;
            const alreadyTriggered =
              lastTriggeredDiceRequestIdRef.current === pending.requestId;
            if (!isExpired && !alreadyTriggered) {
              lastTriggeredDiceRequestIdRef.current = pending.requestId;
              setDiceRollNonce((n) => n + 1);
              setIsDiceRolling(true);
              setGameEvents((prev) => [...prev, { type: 'DICE_ROLL_REQUESTED' }]);
            }
          }
        }
      },
      error: (err) => {
        console.error('PlayerState subscription error:', err);
      },
    });

    return () => sub.unsubscribe();
  }, [conversationId, effectivePersonality]);

  // Subscribe to GameMasterAdventure updates so currentLocation stays live
  useEffect(() => {
    if (!conversationId || effectivePersonality !== 'game_master') return;
    if (!dataClient.models.GameMasterAdventure) return;

    const sub = dataClient.models.GameMasterAdventure.observeQuery({
      filter: { conversationId: { eq: conversationId } },
    }).subscribe({
      next: ({ items }) => {
        const latest = items[0];
        if (latest) {
          setAdventureState(latest as AdventureRecord);
        }
      },
      error: (err) => {
        console.error('GameMasterAdventure subscription error:', err);
      },
    });

    return () => sub.unsubscribe();
  }, [conversationId, effectivePersonality]);


  const startTypingAnimation = (messageIndex: number, fullText: string) => {
    // Clear any existing typing animation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    let currentIndex = 0;
    const typingSpeed = 30; // Characters per second
    let loggedOnce = false; // Only log once to avoid spam

    const typeNextCharacter = () => {
      if (currentIndex < fullText.length) {
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages[messageIndex]) {
            // Log once to see what we're preserving
            if (!loggedOnce && currentIndex === 0) {
              console.log('Typing animation - preserving fields:', {
                sensations: updatedMessages[messageIndex].sensations,
                thoughts: updatedMessages[messageIndex].thoughts,
                memories: updatedMessages[messageIndex].memories,
                selfReflection: updatedMessages[messageIndex].selfReflection,
              });
              loggedOnce = true;
            }
            
            // Preserve all existing fields when updating content
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText.substring(0, currentIndex + 1),
              isTyping: true,
              fullContent: fullText,
              // Keep the additional fields from the original message
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
            };
          }
          return updatedMessages;
        });
        currentIndex++;
      } else {
        // Typing complete
        setMessages(prev => {
          const updatedMessages = [...prev];
          if (updatedMessages[messageIndex]) {
            console.log('Typing animation complete - final message:', {
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
            });
            
            // Preserve all existing fields when marking typing complete
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              content: fullText,
              isTyping: false,
              fullContent: fullText,
              // Keep the additional fields from the original message
              sensations: updatedMessages[messageIndex].sensations,
              thoughts: updatedMessages[messageIndex].thoughts,
              memories: updatedMessages[messageIndex].memories,
              selfReflection: updatedMessages[messageIndex].selfReflection,
            };
          }
          return updatedMessages;
        });
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
      }
    };

    typingIntervalRef.current = setInterval(typeNextCharacter, 1000 / typingSpeed);
  };

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

      try {
        await streamAgentMessage({
          conversationId: targetConversationId,
          messageId: streamedMessageId,
          owner,
          content,
          onEvent: (event: AguiEvent) => {
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
      }

    } catch (error) {
      console.error('Error sending message to backend:', error);
      setIsWaitingForResponse(false);
    }
  };

  // Task 11.5 — submitDiceResult: called after TroubleDice3D produces a result.
  // Sends the dice value and requestId to the backend via AppSync mutation.
  const submitDiceResult = useCallback(
    async (diceValue: number) => {
      const pending = playerState?.pendingDiceRoll as
        | { requestId?: string; statName?: string; difficultyClass?: number }
        | null
        | undefined;
      if (!pending?.requestId || !conversationId) return;

      // Optimistic: clear pendingDiceRoll locally so the UI stops showing the pending state
      applyOptimisticPlayerStateUpdate({ pendingDiceRoll: null });

      try {
        // The backend resolves the stat check and updates PlayerState via the stream.
        // We write a Message with the dice result so the Lambda picks it up.
        await dataClient.models.Message.create({
          content: JSON.stringify({
            type: 'DICE_RESULT',
            requestId: pending.requestId,
            diceValue,
          }),
          conversationId,
        });
      } catch (err) {
        console.error('submitDiceResult failed:', err);
      }
    },
    [playerState, conversationId, applyOptimisticPlayerStateUpdate],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !inputMessage.trim() ||
      isWaitingForResponse ||
      messages.some(m => m.isTyping) ||
      (effectivePersonality === 'game_master' && Boolean(conversationId) && !characterState)
    ) return;

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      activeConversationId = await createConversationWithMode(effectivePersonality);
      if (!activeConversationId) {
        return;
      }
      if (effectivePersonality === 'game_master') {
        if (pendingCharacterDraft) {
          await createCharacter(activeConversationId, pendingCharacterDraft);
          setPendingCharacterDraft(null);
        } else {
          const existingCharacter = await fetchCharacter(activeConversationId);
          if (!existingCharacter) {
            return;
          }
        }
      }
    }

    const userMessage = inputMessage.trim();
    setIsNewInteractionPrimed(false);
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');

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

    await handleSendMessage(userMessage, activeConversationId);
    // Assistant reply will come via subscription
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (
        inputMessage.trim() &&
        !isWaitingForResponse &&
        !messages.some(m => m.isTyping) &&
        !(effectivePersonality === 'game_master' && Boolean(conversationId) && !characterState)
      ) {
        handleSubmit(e as React.FormEvent);
      }
    }
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
    
    setIsSelectingConversation(true);
    setIsNewInteractionPrimed(false);
    setPendingCharacterDraft(null);
    setConversationId(selectedConversationId);
    setIsWaitingForResponse(false);
    setAdventureState(null);
    setQuestSteps([]);
    setCharacterState(null);
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
      const { data: conversationData } = await dataClient.models.Conversation.get({
        id: selectedConversationId
      });
      
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
          await fetchAdventureBundle(selectedConversationId);
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
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        }, 100);
        return;
      }
      
      const { data: conversationMessages } = await dataClient.models.Message.list({
        filter: { conversationId: { eq: selectedConversationId } }
      });
      
      const { data: brainResponses } = await dataClient.models.BrainResponse.list({
        filter: { conversationId: { eq: selectedConversationId } }
      });
      
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
      
      // For each message, add it and its corresponding response
      sortedMessages.forEach(msg => {
        timeline.push({ role: 'user', content: msg.content || '' });
        
        // Find corresponding brain response
        const response = brainResponses?.find(br => br.messageId === msg.id);
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
      
      // Scroll to bottom after messages load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      
      // Set waiting state based on whether there's a pending message
      setIsWaitingForResponse(hasPendingMessage);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
      setIsWaitingForResponse(false);
    } finally {
      setIsSelectingConversation(false);
    }
  };

  const handleNewConversation = async () => {
    adventureFetchLock.current = null;
    previousConversationIdRef.current = conversationId;
    // New conversations are always game_master mode
    const newConversationMode: PersonalityModeId = 'game_master';
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getLastConversationStorageKey(newConversationMode));
    }
    setIsSelectingConversation(false);
    setConversationId(null);
    setMessages([]);
    setInputMessage('');
    setIsWaitingForResponse(false);
    setAdventureState(null);
    setQuestSteps([]);
    setCharacterState(null);
    setPendingCharacterDraft(null);
    setShowCharacterCreation(true);
    setDraggingConversationId(null);
    setIsTrashDragOver(false);
    setExpandedMessageIndex(null);
    setIsNewInteractionPrimed(false);

    setIsSelectingConversation(true);
    try {
      const createdConversationId = await createConversationWithMode(newConversationMode);
      if (!createdConversationId) {
        return;
      }
    } finally {
      setIsSelectingConversation(false);
    }
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
      const currentUserId = userAttributes?.sub || userAttributes?.email || 'anonymous';
      
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
    setIsProfileMenuOpen(false);

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
    if (!draggingConversationId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setIsTrashDragOver(true);
  }, [draggingConversationId]);

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
      void deleteConversationById(droppedConversationId);
    } else {
      setIsTrashDragOver(false);
      setDraggingConversationId(null);
    }
  }, [deleteConversationById, draggingConversationId]);


  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
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
    setInputMessage('');
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
    }
  }, [conversationId, brainConversationId]);

  const isGameMasterMode = effectivePersonality === 'game_master';
  const appThemeClass = isGameMasterMode ? 'retro-rpg-ui--gm' : 'retro-rpg-ui--brain';
  const isGameMasterContentLoading = isGameMasterMode && Boolean(conversationId) && (isSelectingConversation || isLoadingCharacter || isLoadingAdventure);
  const hasGameMasterCharacterReady = Boolean(characterState || pendingCharacterDraft);
  const showGameMasterCharacterFlow = showCharacterCreation && isGameMasterMode && !isGameMasterContentLoading;
  const isGameMasterCharacterRequired = effectivePersonality === 'game_master' && !hasGameMasterCharacterReady;
  const websiteUserProfile = useMemo(() => {
    const attrs = userAttributes ?? {};
    const joinedName = [attrs.given_name, attrs.family_name]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .trim();
    const displayName = attrs.name?.trim()
      || joinedName
      || attrs.preferred_username?.trim()
      || attrs.email?.split('@')[0]
      || 'Website User';
    const email = attrs.email?.trim() || 'No email available';
    const userId = attrs.sub?.trim() || '';
    const avatarUrl = attrs.picture?.trim() || '';
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'WU';
    return {
      displayName,
      email,
      userId,
      avatarUrl,
      initials,
    };
  }, [userAttributes]);
  const showMobileInlineCharacterCreation = showGameMasterCharacterFlow;
  const showRightPanelCharacterCreation =
    showGameMasterCharacterFlow && !characterState;
  const hasTypingMessage = messages.some(m => m.isTyping);
  const isInputLocked = isWaitingForResponse || hasTypingMessage || isGameMasterContentLoading || isGameMasterCharacterRequired;
  const gameMasterInputPlaceholder = isGameMasterContentLoading
    ? 'Loading adventure...'
    : isGameMasterCharacterRequired
      ? 'Create your character to begin your adventure...'
      : 'What do you do next?';

  const normalizedQuestSteps = useMemo(() => mapQuestStepsToHud(questSteps), [questSteps]);

  const derivedQuestSteps = useMemo(() => {
    if (normalizedQuestSteps.length > 0 || effectivePersonality !== 'game_master') return [];
    return deriveHudQuestStepsFromMessages(messages);
  }, [normalizedQuestSteps, messages, effectivePersonality]);

  const hudQuestSteps = normalizedQuestSteps.length > 0 ? normalizedQuestSteps : derivedQuestSteps;
  const characterDisplay = useMemo(() => getCharacterData(), [getCharacterData]);
  const currentLocation = useMemo(() => {
    const PLACEHOLDER = /^(unknown|unknown location|n\/a|none|null|undefined)$/i;
    const isValid = (v: string | null | undefined): v is string =>
      typeof v === 'string' && v.trim().length > 0 && !PLACEHOLDER.test(v.trim());

    if (isValid(adventureState?.currentLocation)) return adventureState!.currentLocation!;
    if (isValid(adventureState?.lastLocation)) return adventureState!.lastLocation!;
    return undefined;
  }, [adventureState?.currentLocation, adventureState?.lastLocation]);
  
  const currentAct = useMemo(() => {
    if (!adventureState?.currentAct) return 'I';
    
    const actMap: Record<string, string> = {
      'EXPOSITION': 'I',
      'RISING_ACTION': 'II',
      'CLIMAX': 'III',
      'FALLING_ACTION': 'IV',
      'RESOLUTION': 'V'
    };
    
    return actMap[adventureState.currentAct] || 'I';
  }, [adventureState?.currentAct]);
  
  const currentChapter = useMemo(() => {
    return adventureState?.currentChapter || 1;
  }, [adventureState?.currentChapter]);
  
  const latestDiceRoll = useMemo(() => {
    if (lastManualDiceRoll) {
      return String(lastManualDiceRoll.value);
    }
    const patterns = [
      /\bd20\b[^0-9]*(\d{1,2})/i,
      /\broll(?:ed)?\b[^0-9]*(\d{1,2})/i,
      /\b(\d{1,2})\s*\/\s*20\b/i,
    ];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = messages[i]?.fullContent || messages[i]?.content || '';
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1];
      }
    }
    return null;
  }, [lastManualDiceRoll, messages]);
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && Boolean(message.content || message.fullContent)),
    [messages],
  );
  const mentalStateLabel = useMemo(() => {
    const source = `${latestAssistantMessage?.selfReflection || ''} ${latestAssistantMessage?.memories || ''}`.toLowerCase();
    if (isWaitingForResponse) return 'Neural Activity Rising';
    if (source.includes('calm') || source.includes('serene')) return 'Calm Resonance';
    if (source.includes('fear') || source.includes('anxious') || source.includes('panic')) return 'Anxious Interference';
    if (source.includes('curious') || source.includes('wonder')) return 'Curious Drift';
    if (source.includes('focused') || source.includes('clarity')) return 'Focused Coherence';
    return 'Reflective Drift';
  }, [isWaitingForResponse, latestAssistantMessage]);
  const mentalStateIntensity = useMemo(() => {
    const sensationCount = latestAssistantMessage?.sensations?.length ?? 0;
    const thoughtCount = latestAssistantMessage?.thoughts?.length ?? 0;
    return Math.min(100, 25 + sensationCount * 14 + thoughtCount * 8 + (isWaitingForResponse ? 12 : 0));
  }, [isWaitingForResponse, latestAssistantMessage]);
  const sendButtonStateClass = !inputMessage.trim() || isInputLocked
    ? 'retro-send-button-disabled cursor-not-allowed opacity-60'
    : 'retro-send-button-active-brain text-white hover:-translate-y-0.5 active:translate-y-0';
  const canUseDiceRoll = isGameMasterMode && !isInputLocked && !isDiceRolling;

  const handleDiceRoll = useCallback(async () => {
    if (!canUseDiceRoll) return;

    const sides = 20;
    setIsDiceRolling(true);
    setDiceRollNonce((prev) => prev + 1);

    // Pop-o-matic "bubbles" effect window.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 620);
    });

    const value = Math.floor(Math.random() * sides) + 1;
    setLastManualDiceRoll({ value, sides });
    setDiceRollPulseId((prev) => prev + 1);

    // Task 11.5 — if a pendingDiceRoll is active, submit the result to the backend
    const hasPendingRoll = Boolean(
      (playerState?.pendingDiceRoll as { requestId?: string } | null | undefined)?.requestId,
    );
    if (hasPendingRoll) {
      await submitDiceResult(value);
    } else {
      setInputMessage((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) {
          return `I rolled a d${sides}: ${value}. `;
        }
        return `${prev}${prev.endsWith(' ') ? '' : ' '}[d${sides}: ${value}] `;
      });
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    setIsDiceRolling(false);
  }, [canUseDiceRoll, playerState, submitDiceResult]);

  const keyboardHintKeyClass = 'retro-keycap px-1.5 py-0.5 rounded-md text-[10px] font-mono';

  return (
    <div className={`retro-rpg-ui ${appThemeClass} h-screen overflow-hidden relative`}>

      {/* Task 11.3 — optimistic rollback error toast */}
      {playerStateError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-brand-surface-elevated border border-brand-surface-border px-4 py-3 shadow-lg text-sm text-brand-text-secondary">
          <span>{playerStateError}</span>
          <button
            type="button"
            onClick={() => setPlayerStateError(null)}
            className="ml-2 text-brand-text-muted hover:text-brand-text-primary transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Desktop: Main Layout */}
      <div className="hidden lg:flex flex-col h-full">
        <div className="flex-1 min-h-0 grid retro-shell">
        {/* Left Sidebar - full height */}
        <aside className="retro-shell-left">
          <div className="retro-left-container retro-left-panel-icon-only relative flex h-full flex-col overflow-visible px-3">
                <div className="flex h-full flex-col items-center gap-5 py-4">
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

                  <div ref={profileMenuRef} className="relative z-40">
                    <button
                      type="button"
                      onClick={() => { void handleSidebarDeleteAction(); }}
                      onDragOver={handleTrashDragOver}
                      onDragLeave={handleTrashDragLeave}
                      onDrop={handleTrashDrop}
                      className={`retro-icon-button retro-tooltip-trigger mb-2 h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-200 ${
                        isTrashDragOver
                          ? 'border-brand-status-error/70 bg-brand-status-error/28 text-brand-status-error scale-[1.16] shadow-[0_12px_26px_rgba(239,68,68,0.34)]'
                          : 'border-brand-surface-border/50 bg-brand-surface-secondary/60 text-brand-text-primary hover:border-brand-surface-border/70 hover:bg-brand-surface-secondary/75'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                      aria-label="Delete current chat"
                      disabled={!conversationId}
                      data-tooltip={conversationId ? 'Delete current chat' : 'No chat to delete'}
                      data-tooltip-position="right"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a3 3 0 016 0v2m-7 4v6m4-6v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                      className={`retro-icon-button retro-tooltip-trigger h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-200 ${
                        isProfileMenuOpen
                          ? 'border-brand-accent-primary/65 bg-brand-accent-primary/18 text-brand-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]'
                          : 'border-brand-surface-border/50 bg-brand-surface-secondary/60 text-brand-text-primary hover:border-brand-surface-border/70 hover:bg-brand-surface-elevated/70'
                      }`}
                      aria-label="Open profile menu"
                      data-tooltip="Account menu"
                      data-tooltip-position="right"
                    >
                      <span className="relative flex items-center justify-center" aria-hidden="true">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 7h16M4 12h16M4 17h16" />
                        </svg>
                        <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full transition-colors ${
                          isProfileMenuOpen ? 'bg-brand-accent-primary' : 'bg-brand-text-muted/50'
                        }`} />
                      </span>
                    </button>

                    {isProfileMenuOpen && (
                      <div className="retro-dropdown absolute bottom-0 left-[calc(100%+10px)] z-[90] min-w-[220px] rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/95 p-2 shadow-glass-lg backdrop-blur-xl">
                        <div className="px-2 py-1.5">
                          <p className="truncate text-xs font-medium text-brand-text-primary">{websiteUserProfile.displayName}</p>
                          <p className="truncate text-[11px] text-brand-text-muted">{websiteUserProfile.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="retro-dropdown-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-text-primary"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign out
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSidebarDeleteAction(); }}
                          disabled={!conversationId}
                          className="retro-dropdown-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-text-muted hover:text-brand-status-error disabled:opacity-45 disabled:cursor-not-allowed"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a3 3 0 016 0v2m-7 4v6m4-6v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
                          </svg>
                          Delete chat
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

          <main 
            className="retro-shell-center retro-main flex flex-col min-w-0 overflow-hidden relative px-4 pb-4 pt-4"
          >
          <div className="text-center mb-4 flex-shrink-0">
            <span className="retro-title text-lg font-light text-brand-text-primary tracking-wide relative inline-block after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-full after:h-[2px] after:bg-gradient-to-r after:from-transparent after:via-brand-accent-primary after:to-transparent after:rounded-full after:shadow-[0_0_8px_rgba(94,234,212,0.5)]">Brain in Cup</span>
          </div>
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
                      {conversationId && isGameMasterMode && (
                        <div className="px-3 pt-2 shrink-0">
                          <div className="mx-auto max-w-4xl">
                            <div className="retro-status-strip retro-status-strip-floating">
                              <div className="grid grid-cols-3 items-end text-center">
                                <div className="text-left">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted">Day</p>
                                  <p className="text-lg font-light text-brand-text-primary">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted">Location</p>
                                  <p className="text-lg font-light text-brand-text-primary">{currentLocation}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted">Act</p>
                                  <p className="text-lg font-light text-brand-text-primary">{currentAct} • Ch. {currentChapter}</p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 h-px bg-gradient-to-r from-transparent via-brand-accent-primary/40 to-transparent" />
                          </div>
                        </div>
                      )}

                        <div
                          ref={desktopScrollContainerRef}
                          className="flex-1 overflow-y-auto pr-2"
                        >
                          <div ref={desktopContentRef} className="mx-auto max-w-4xl space-y-6 flex flex-col transition-all duration-300">
                          {/* Mode indicator removed */}

                          {conversationId && effectivePersonality === 'game_master' && adventureState && (
                            <div className="lg:hidden">
                              <GameMasterHud
                                adventure={adventureState}
                                questSteps={hudQuestSteps}
                                character={characterState}
                                isLoadingCharacter={isLoadingCharacter}
                                onUpdateInventory={updateInventory}
                              />
                            </div>
                          )}
              
              {messages.filter(m => !m.content?.startsWith('[SYSTEM:')).map((message, index) => (
                <MessageBubble
                  key={index}
                  message={message}
                  isGameMasterMode={isGameMasterMode}
                  variant="desktop"
                  expanded={expandedMessageIndex === index}
                  onToggleExpanded={() => {
                    if (message.role === 'assistant') {
                      setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                    }
                  }}
                  containerRef={(el) => {
                    if (el && message.role === 'assistant') {
                      messageContainerRefs.current.set(index, el);
                    }
                  }}
                />
              ))}
              
                          {isWaitingForResponse && (
                            <div className="retro-waiting-row flex gap-4 justify-start animate-slide-up">
                              <div className="retro-message retro-waiting-bubble rounded-2xl px-4 py-3 backdrop-blur-lg text-brand-text-primary">
                                <div className="flex items-center gap-2">
                                  <div className="flex space-x-1">
                                    <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                                    <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                                    <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                                  </div>
                                  <span className="text-sm text-brand-text-muted">
                                    {isGameMasterMode ? 'The world shifts around your decision...' : 'Brain is thinking...'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
              
                  
                          {/* Invisible element to scroll to - at the bottom */}
                          <div ref={messagesEndRef} />
                        </div>
                      </div>
                    </div>
                    <div className="mx-auto w-full max-w-4xl px-3">
                      <div className="h-px bg-gradient-to-r from-transparent via-brand-accent-primary/40 to-transparent" />
                    </div>
                      <BottomInput className="px-0 pt-3 shrink-0">
                        <div className="mx-auto max-w-4xl transition-all duration-300">
                          <form onSubmit={handleSubmit} className="relative">
                            <div className={`retro-input-shell flex gap-2 items-end rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/80 backdrop-blur-xl p-2 shadow-lg transition-all duration-200 ${isNewInteractionPrimed ? 'retro-input-shell-primed' : ''}`}>
                              {/* Textarea */}
                              <div className="flex-1 min-w-0">
                                <textarea
                                  ref={inputRef}
                                  value={inputMessage}
                                  onChange={(e) => setInputMessage(e.target.value)}
                                  onKeyDown={handleKeyDown}
                                  placeholder={
                                    isWaitingForResponse
                                      ? 'Brain is thinking...'
                                      : conversationId
                                        ? (effectivePersonality === 'game_master' ? gameMasterInputPlaceholder : 'Message Brain...')
                                        : (isNewInteractionPrimed ? 'New chat ready. Start typing...' : 'Start a new conversation...')
                                  }
                                  className="retro-input-textarea w-full px-3 py-2.5 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-[15px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                                  rows={1}
                                  style={{
                                    maxHeight: '140px',
                                    minHeight: '44px',
                                    height: 'auto'
                                  }}
                                  onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = Math.min(target.scrollHeight, 140) + 'px';
                                  }}
                                />
                              </div>

                              {/* Send Button */}
                              <button
                                type="submit"
                                className={`retro-send-button flex-shrink-0 rounded-xl p-2.5 transition-all duration-200 focus:outline-none ${sendButtonStateClass}`}
                                disabled={!inputMessage.trim()}
                                aria-label="Send message"
                              >
                                {isWaitingForResponse ? (
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            <p className="mt-1.5 text-center text-[11px] text-brand-text-muted/45">
                              Press <kbd className={keyboardHintKeyClass}>Enter</kbd> to send, <kbd className={keyboardHintKeyClass}>Shift+Enter</kbd> for new line
                            </p>
                          </form>
                        </div>
                      </BottomInput>
                  </section>
              </div>
          </main>
        <aside className="retro-shell-right">
          <div className="retro-right-container flex flex-col h-full overflow-y-auto">
                {isGameMasterMode ? (
                    showRightPanelCharacterCreation ? (
                      <div className="flex h-full flex-col p-5 overflow-y-auto">
                        <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-brand-text-muted">Character Setup</p>
                        <CharacterCreation
                          inline
                          embedded
                          onComplete={handleCharacterCreationComplete}
                          onCancel={handleCharacterCreationCancel}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col gap-4 p-5 retro-right-stack">
                        {/* Context Window Panel — character sheet and dice history */}
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
                          activeQuests={[]}
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
                          gameEvents={gameEvents}
                        />

                        {/* Inventory */}
                        {characterDisplay && (
                        <div className="retro-right-section retro-right-section--inventory">
                          <InventoryManager
                            inventory={characterDisplay.inventory}
                            onUpdateInventory={updateInventory}
                            isUpdating={false}
                          />
                        </div>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            void handleDiceRoll();
                          }}
                          disabled={!canUseDiceRoll}
                          className={`retro-roll-panel-button retro-tooltip-trigger mt-auto relative rounded-xl ${
                            isDiceRolling ? 'retro-roll-panel-button--rolling' : ''
                          }`}
                          aria-label={isDiceRolling ? 'Rolling d20' : 'Roll a d20'}
                          data-tooltip={isDiceRolling ? 'Rolling d20…' : 'Roll d20'}
                          data-tooltip-position="top"
                        >
                          <TroubleDice3D
                            rollNonce={diceRollNonce}
                            isRolling={isDiceRolling}
                            pulseId={diceRollPulseId}
                            displayValue={latestDiceRoll || (isDiceRolling ? '...' : 'd20')}
                          />
                        </button>

                      </div>
                    )
                ) : (
                  <div className="flex h-full flex-col gap-4 p-5">
                    <div className="retro-mental-state-section">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-brand-text-muted">Current Mental State</p>
                      <p className="mt-2 text-lg font-medium text-brand-text-primary">{mentalStateLabel}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-bg-primary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-400/50 via-purple-400/70 to-violet-400/50 shadow-[0_0_12px_rgba(167,139,250,0.4)] transition-all duration-500"
                          style={{ width: `${mentalStateIntensity}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-brand-text-muted">Intensity: {Math.round(mentalStateIntensity)}%</p>
                    </div>

                    {/* Mode indicator removed */}

                  </div>
                )}
          </div>
        </aside>
      </div>
      </div>

      {/* Mobile: Main Content Area */}
      <main 
        className="retro-mobile-main lg:hidden flex flex-col h-full px-2 pb-2 pt-2"
      >
        {/* Mobile Top Nav Bar */}
        <nav className="retro-nav retro-mobile-nav sticky top-0 z-[60] bg-brand-surface-elevated/95 backdrop-blur-xl border-b border-brand-surface-border/50 shadow-lg pt-safe rounded-3xl">
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="retro-title text-lg font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
            </div>

            <div>
              {/* Mode toggle buttons removed - mode is now hardcoded to game_master */}
            </div>
          </div>
        </nav>

        {/* Floating Expandable Header Bars - Side by Side - Only for Game Master mode */}
        {effectivePersonality === 'game_master' && characterState && characterDisplay && !isGameMasterContentLoading && (
          <div className="retro-mobile-bars lg:hidden sticky top-0 z-40 pt-safe">
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
                    className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-brand-text-muted uppercase tracking-wider">
                      Quest Log
                        </p>
                        <p className="text-sm text-brand-text-primary font-medium truncate">
                          No active quest
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
                      {adventureState && (
                        <div className="space-y-3">
                          {/* TODO: Replace stubbed values with database data */}
                          <div>
                            <h3 className="text-base font-semibold text-brand-text-primary mb-1">
                              {adventureState.title || 'The Shadowed Forest'}
                            </h3>
                            <p className="text-sm text-brand-text-secondary">
                              {adventureState.genre || 'Dark Fantasy'} • Tone: {adventureState.tone || 'Gritty'} • Difficulty: {adventureState.difficulty || 'Deadly'}
                            </p>
                          </div>

                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Second Bar - Character Sheet (D&D style) */}
              <div className="flex-1 relative">
                <div 
                  className={`retro-mobile-card rounded-2xl bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
                    mobileCharSheetExpanded ? 'absolute top-0 left-0 w-auto min-w-full max-w-md z-50' : ''
                  }`}
                >
                  <button
                    onClick={() => setMobileCharSheetExpanded(!mobileCharSheetExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none"
                  >
                    <div className="retro-character-identity retro-character-identity--compact flex items-center gap-3 min-w-0">
                      {characterDisplay.avatarSrc ? (
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
                      ) : null}
                      <div className="retro-character-meta retro-character-meta--compact min-w-0 flex-1">
                        <p className="text-xs text-brand-text-muted uppercase tracking-wider">Character</p>
                        <p className="text-sm text-brand-text-primary font-medium truncate">{characterDisplay.name}</p>
                      </div>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-brand-text-muted transition-transform duration-300 flex-shrink-0 ${
                        mobileCharSheetExpanded ? 'rotate-180' : ''
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded Character Sheet Content */}
                  {mobileCharSheetExpanded && adventureState && !isGameMasterContentLoading && characterState && characterDisplay && (() => {
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
          <div
            ref={mobileScrollContainerRef}
            className="retro-scroll-panel flex-1 overflow-y-auto px-4 py-5 pb-3 scrollbar-thin scrollbar-thumb-brand-surface-tertiary flex flex-col rounded-3xl"
          >
            <div ref={mobileContentRef} className="max-w-4xl mx-auto space-y-4 flex flex-col">
              {showMobileInlineCharacterCreation && (
                <div className="mx-auto w-full max-w-xl pb-2">
                  <CharacterCreation
                    inline
                    onComplete={handleCharacterCreationComplete}
                    onCancel={handleCharacterCreationCancel}
                  />
                </div>
              )}
              
              {messages.filter(m => !m.content?.startsWith('[SYSTEM:')).map((message, index) => (
                <MessageBubble
                  key={index}
                  message={message}
                  isGameMasterMode={isGameMasterMode}
                  variant="mobile"
                  expanded={expandedMessageIndex === index}
                  onToggleExpanded={() => {
                    if (message.role === 'assistant') {
                      setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                    }
                  }}
                  containerRef={(el) => {
                    if (el && message.role === 'assistant') {
                      messageContainerRefs.current.set(index, el);
                    }
                  }}
                />
              ))}
              
              {isWaitingForResponse && (
                <div className="retro-waiting-row flex gap-3 justify-start animate-slide-up">
                  <div className="retro-message retro-waiting-bubble rounded-2xl px-4 py-3 backdrop-blur-lg text-brand-text-primary">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                      </div>
                      <span className="text-sm text-brand-text-muted">
                        {isGameMasterMode ? 'The world shifts around your decision...' : 'Brain is thinking...'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Invisible element to scroll to - at the bottom */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Mobile Input Area */}
            <div className="retro-input-dock pt-3 pb-3 px-3 pb-safe">
              <div className="max-w-4xl mx-auto">
                <form onSubmit={handleSubmit} className="relative">
                  <div className={`retro-input-shell flex gap-2 items-end bg-brand-surface-elevated/80 backdrop-blur-xl rounded-2xl border border-brand-surface-border/50 p-2.5 transition-all duration-200 ${isNewInteractionPrimed ? 'retro-input-shell-primed' : ''}`}>
                    {/* Textarea */}
                    <div className="flex-1 min-w-0">
                      <textarea
                        ref={inputRef}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isWaitingForResponse
                            ? 'Brain is thinking...'
                            : conversationId
                              ? (effectivePersonality === 'game_master' ? gameMasterInputPlaceholder : 'Message Brain...')
                              : (isNewInteractionPrimed ? 'New chat ready. Start typing...' : 'Start a new conversation...')
                        }
                        className="retro-input-textarea w-full px-3 py-2 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-sm leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                        rows={1}
                        style={{ 
                          maxHeight: '112px',
                          minHeight: '40px',
                          height: 'auto'
                        }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = Math.min(target.scrollHeight, 112) + 'px';
                        }}
                      />
                    </div>

                    {/* Send Button */}
                    <button
                      type="submit"
                      className={`retro-send-button flex-shrink-0 p-2 rounded-xl transition-all duration-200 focus:outline-none active:scale-95 ${sendButtonStateClass}`}
                      disabled={!inputMessage.trim()}
                      aria-label="Send message"
                    >
                      {isWaitingForResponse ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-center text-[11px] text-brand-text-muted/45">
                    Press <kbd className={keyboardHintKeyClass}>Enter</kbd> to send, <kbd className={keyboardHintKeyClass}>Shift+Enter</kbd> for new line
                  </p>
                </form>
              </div>
            </div>
        </div>

      </main>

      {/* Install Prompt */}
      <InstallPrompt />

    </div>
  );
}

export default App;
