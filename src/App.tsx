import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import BrainIcon from './components/BrainIcon';
import PersonalityIndicator from './components/PersonalityIndicator';
import InstallPrompt from './components/InstallPrompt';
import CharacterCreation from './components/CharacterCreation';
import InventoryManager, { type InventoryItem } from './components/InventoryManager';
import { MODE_OPTIONS, normalizePersonalityMode } from './constants/personalityModes';
import type { PersonalityModeId } from './constants/personalityModes';
const dataClient = generateClient<Schema>();

type AdventureRecord = Schema['GameMasterAdventure']['type'];
type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
type PlayerChoiceRecord = Schema['GameMasterPlayerChoice']['type'];
type CharacterRecord = Schema['GameMasterCharacter']['type'];
type CharacterCreationInput = {
  name: string;
  race: string;
  characterClass: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};

interface HudQuestStep {
  id: string;
  summary: string;
  dangerLevel: string;
  createdAt?: string | null;
}

interface HudPlayerChoice {
  id: string;
  content: string;
  toneTag?: string | null;
  createdAt?: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
  fullContent?: string; // Store the complete content when typing
  // Additional AI response data
  sensations?: string[];
  thoughts?: string[];
  memories?: string;
  selfReflection?: string;
}

const summarizeText = (text: string, max = 220) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text.trim();
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
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${base} • ${date} ${time}`;
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

const mapPlayerChoicesToHud = (choices: PlayerChoiceRecord[]): HudPlayerChoice[] =>
  choices
    .filter((choice): choice is PlayerChoiceRecord & { id: string } => Boolean(choice && choice.id))
    .map((choice) => ({
      id: choice.id!,
      content: choice.content || '',
      toneTag: choice.toneTag || inferToneTag(choice.content || ''),
      createdAt: choice.createdAt,
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

const deriveHudPlayerChoicesFromMessages = (messages: Message[]): HudPlayerChoice[] =>
  messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'user' && Boolean(message.content?.trim()))
    .map(({ message, index }) => ({
      id: `derived-choice-${index}`,
      content: message.content,
      toneTag: inferToneTag(message.content),
      createdAt: null,
    }));

interface GameMasterHudProps {
  adventure: AdventureRecord;
  questSteps: HudQuestStep[];
  playerChoices: HudPlayerChoice[];
  character: CharacterRecord | null;
  isLoadingCharacter?: boolean;
  onUpdateInventory?: (newInventory: InventoryItem[]) => Promise<void>;
}

function GameMasterHud({ adventure, questSteps, playerChoices, character, isLoadingCharacter, onUpdateInventory }: GameMasterHudProps) {
  const latestStep = questSteps.slice(-1)[0];
  void playerChoices;
  
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
  
  // Parse inventory JSON string to InventoryItem array
  let inventory: InventoryItem[] = [];
  if (character.inventory) {
    try {
      const parsed = typeof character.inventory === 'string' 
        ? JSON.parse(character.inventory) 
        : character.inventory;
      
      // Handle legacy string array format
      if (Array.isArray(parsed)) {
        inventory = parsed.map((item: any) => {
          if (typeof item === 'string') {
            // Convert legacy string format to InventoryItem
            return {
              id: crypto.randomUUID(),
              name: item,
              type: 'consumable' as const,
              quantity: 1,
            };
          }
          return item;
        });
      }
    } catch (e) {
      console.error('Failed to parse inventory:', e);
    }
  }
  
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
  const [isLoading, setIsLoading] = useState(true);
  const [userAttributes, setUserAttributes] = useState<Record<string, string | undefined> | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);

  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false);
  const [mobileCharSheetExpanded, setMobileCharSheetExpanded] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [expandedMessageIndex, setExpandedMessageIndex] = useState<number | null>(null); // Track which message's details are shown
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  
  // Game Master data state
  const [adventureState, setAdventureState] = useState<AdventureRecord | null>(null);
  const [questSteps, setQuestSteps] = useState<QuestStepRecord[]>([]);
  const [playerChoices, setPlayerChoices] = useState<PlayerChoiceRecord[]>([]);
  const [characterState, setCharacterState] = useState<CharacterRecord | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false);
  const [showCharacterCreation, setShowCharacterCreation] = useState(false);
  const characterCreationLock = useRef(false);
  const adventureFetchLock = useRef<string | null>(null);
  
  // Helper to get character display data with fallbacks
  const getCharacterData = useCallback(() => {
    const stats = {
      strength: characterState?.strength || 10,
      dexterity: characterState?.dexterity || 12,
      constitution: characterState?.constitution || 14,
      intelligence: characterState?.intelligence || 16,
      wisdom: characterState?.wisdom || 13,
      charisma: characterState?.charisma || 11,
    };
    
    const hp = {
      current: characterState?.currentHP || 12,
      max: characterState?.maxHP || 12,
      percentage: ((characterState?.currentHP || 12) / (characterState?.maxHP || 12)) * 100,
    };
    
    let inventory: InventoryItem[] = [];
    if (characterState?.inventory) {
      try {
        const parsed = typeof characterState.inventory === 'string' 
          ? JSON.parse(characterState.inventory) 
          : characterState.inventory;
        
        // Handle legacy string array format
        if (Array.isArray(parsed)) {
          inventory = parsed.map((item: any) => {
            if (typeof item === 'string') {
              // Convert legacy string format to InventoryItem
              return {
                id: crypto.randomUUID(),
                name: item,
                type: 'consumable' as const,
                quantity: 1,
              };
            }
            return item;
          });
        }
      } catch (e) {
        console.error('Failed to parse inventory:', e);
      }
    }
    
    return {
      name: characterState?.name || 'Adventurer',
      race: characterState?.race || 'Wanderer',
      characterClass: characterState?.characterClass || 'Wanderer',
      level: characterState?.level || 1,
      stats,
      hp,
      inventory,
    };
  }, [characterState]);
  
  // Personality mode state
  const [personalityMode, setPersonalityMode] = useState<string>('default');
  const effectivePersonality = normalizePersonalityMode(personalityMode);

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

  const fetchCharacter = useCallback(async (convId: string, retryCount = 0): Promise<CharacterRecord | null> => {
    // Prevent duplicate creation with ref-based lock
    if (characterCreationLock.current) {
      return null;
    }
    
    setIsLoadingCharacter(true);
    
    try {
      // WORKAROUND: Fetch all characters and filter client-side
      // This bypasses Amplify's broken filter authorization
      let data, errors;
      try {
        const result = await dataClient.models.GameMasterCharacter.list({
          limit: 1000, // Get all characters
          authMode: 'userPool',
        });
        data = result.data;
        errors = result.errors;
        
        // Filter client-side for the specific conversationId
        if (data) {
          data = data.filter(char => char.conversationId === convId);
        }
      } catch (authError) {
        const result = await dataClient.models.GameMasterCharacter.list({
          limit: 1000,
        });
        data = result.data;
        errors = result.errors;
        
        // Filter client-side
        if (data) {
          data = data.filter(char => char.conversationId === convId);
        }
      }
      
      if (errors && errors.length > 0) {
        console.error('Error fetching character:', errors);
      }
      
      if (data && data.length > 0 && data[0]) {
        const character = data[0] as CharacterRecord;
        setCharacterState(character);
        setShowCharacterCreation(false);
        setIsLoadingCharacter(false);
        return character;
      }
      
      // Retry up to 2 times with delay if no character found (database propagation)
      if (retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchCharacter(convId, retryCount + 1);
      }
      
      // No character exists after retries - show character creation modal
      setIsLoadingCharacter(false);
      setShowCharacterCreation(true);
      return null;
    } catch (error) {
      console.error('❌ Error loading character:', error);
      setIsLoadingCharacter(false);
      characterCreationLock.current = false;
      return null;
    }
  }, []);

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
      
      const created = await dataClient.models.GameMasterCharacter.create({
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
      });
      
      if (created.data) {
        setCharacterState(created.data as CharacterRecord);
        setShowCharacterCreation(false);
        // Small delay to ensure database write propagates
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (created.errors) {
        console.error('Character creation failed:', created.errors);
        throw new Error('Failed to create character');
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
    setCharacterState(prev => prev ? { ...prev, inventory: JSON.stringify(newInventory) as any } : prev);
    
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
    
    try {
      const activeMode = normalizePersonalityMode(modeOverride ?? effectivePersonality);
      if (activeMode !== 'game_master') {
        setAdventureState(null);
        setQuestSteps([]);
        setPlayerChoices([]);
        setCharacterState(null);
        adventureFetchLock.current = null;
        return;
      }
      const character = await fetchCharacter(convId);
      if (!character) {
        setAdventureState(null);
        setQuestSteps([]);
        setPlayerChoices([]);
        adventureFetchLock.current = null;
        return;
      }

      const adventure = await ensureAdventureState(convId, activeMode);
      if (!adventure || !adventure.id) {
        adventureFetchLock.current = null;
        return;
      }
      const adventureId = adventure.id as string;
      
      try {
        const [stepsRes, choicesRes] = await Promise.all([
          dataClient.models.GameMasterQuestStep.list({
            filter: { adventureId: { eq: adventureId } },
            limit: 200,
          }),
          dataClient.models.GameMasterPlayerChoice.list({
            filter: { conversationId: { eq: convId } },
            limit: 200,
          }),
        ]);
        const steps = ((stepsRes.data ?? []).filter(Boolean) as QuestStepRecord[])
          .sort((a, b) => ((a?.createdAt ?? '') < (b?.createdAt ?? '') ? -1 : 1));
        const choices = ((choicesRes.data ?? []).filter(Boolean) as PlayerChoiceRecord[])
          .sort((a, b) => ((a?.createdAt ?? '') < (b?.createdAt ?? '') ? -1 : 1));
        setQuestSteps(steps);
        setPlayerChoices(choices);
      } catch (error) {
        console.error('Error loading Game Master data:', error);
      }
    } finally {
      adventureFetchLock.current = null;
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
      const created = await dataClient.models.GameMasterPlayerChoice.create({
        questStepId: adventure.lastStepId,
        conversationId,
        messageId,
        content,
        toneTag: inferToneTag(content),
        createdAt: new Date().toISOString(),
      });
      const playerChoice = (created.data as PlayerChoiceRecord | null) ?? null;
      if (playerChoice) {
        setPlayerChoices(prev => [...prev, playerChoice]);
      }
    } catch (error) {
      console.error('Error recording player choice:', error);
    }
  }, [conversationId, effectivePersonality, ensureAdventureState]);

  useEffect(() => {
    if (!conversationId) {
      setAdventureState(null);
      setQuestSteps([]);
      setPlayerChoices([]);
      setCharacterState(null);
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
  const messageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map()); // Track individual message container refs (bubble + details)
  const desktopScrollContainerRef = useRef<HTMLDivElement>(null); // Desktop scroll container
  const desktopModeDropdownRef = useRef<HTMLDivElement>(null);
  const mobileModeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isModeDropdownOpen) return;
    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node;
      const clickedDesktopDropdown = desktopModeDropdownRef.current?.contains(target);
      const clickedMobileDropdown = mobileModeDropdownRef.current?.contains(target);
      if (!clickedDesktopDropdown && !clickedMobileDropdown) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isModeDropdownOpen]);

  useEffect(() => {
    async function getUserAttributes() {
      try {
        // For test mode, set mock user attributes
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('testmode') === 'true') {
          console.log('✅ Test mode: Setting mock user attributes');
          setUserAttributes({ sub: 'test-user-123', email: 'test@example.com' });
          setIsLoading(false);
          return;
        }

        const attributes = await fetchUserAttributes();
        setUserAttributes(attributes);
        setIsLoading(false);
      } catch (error) {
        console.error('❌ Error fetching user attributes:', error);
        setIsLoading(false);
      }
    }
    getUserAttributes();
  }, []);

  // Save conversationId to localStorage whenever it changes
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('lastConversationId', conversationId);
    }
  }, [conversationId]);

  // Auto-load most recent conversation or create new one on app start
  useEffect(() => {
    async function autoLoadConversation() {
      if (!userAttributes || conversationId) return; // Don't run if already have conversation or no user
      
      try {
        
        // For test mode, auto-select test conversation or create new one
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('testmode') === 'true') {
          if (urlParams.get('noconversations') === 'true') {
            console.log('✅ Test mode: No conversations, creating new one');
            await handleNewConversation();
          } else {
            console.log('✅ Test mode: Auto-selecting test conversation');
            setConversationId('test-conversation-1');
          }
          return;
        }

        // Check for last conversation ID in localStorage
        const lastConversationId = localStorage.getItem('lastConversationId');
        if (lastConversationId) {
          try {
            // Verify the conversation still exists
            const { data: conversation } = await dataClient.models.Conversation.get({ id: lastConversationId });
            if (conversation) {
              await handleSelectConversation(lastConversationId);
              return;
            } else {
              localStorage.removeItem('lastConversationId');
            }
          } catch (error) {
            console.error('❌ Error verifying last conversation:', error);
            localStorage.removeItem('lastConversationId');
          }
        }

        // Load existing conversations
        const { data: conversations } = await dataClient.models.Conversation.list();
        
        if (conversations && conversations.length > 0) {
          // Sort by most recent and select the first one
          const sortedConversations = conversations.sort((a, b) => {
            const aDate = new Date(a.updatedAt || a.createdAt || 0);
            const bDate = new Date(b.updatedAt || b.createdAt || 0);
            return bDate.getTime() - aDate.getTime();
          });
          
          const mostRecentConversation = sortedConversations[0];
          await handleSelectConversation(mostRecentConversation.id!);
        } else {
          // No conversations exist, create a new one
          await handleNewConversation();
        }
      } catch (error) {
        console.error('❌ Error auto-loading conversation:', error);
        // Fallback: create new conversation
        try {
          await handleNewConversation();
        } catch (fallbackError) {
          console.error('❌ Fallback new conversation failed:', fallbackError);
        }
      }
    }

    autoLoadConversation();
  }, [userAttributes]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + D toggles debug info (dev only)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        setShowDebugInfo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
              console.log('✅ MATCH: Starting typing animation for response:', brainResponse.response);
              console.log('✅ MATCH: Including metadata - sensations:', brainResponse.sensations, 'thoughts:', brainResponse.thoughts);
              if (effectivePersonality === 'game_master') {
                recordQuestStep(brainResponse);
              }
              
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

  // Typing animation function
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

  const handleSendMessage = async (content: string): Promise<void> => {
    try {
      setIsWaitingForResponse(true);
      
      if (!conversationId) {
        console.error('No conversation ID available');
        setIsWaitingForResponse(false);
        return;
      }

      const { data: savedMessage } = await dataClient.models.Message.create({
        content,
        conversationId: conversationId
      });

      if (savedMessage?.id) {
        await recordPlayerChoice(savedMessage.id, content);
      }

    } catch (error) {
      console.error('Error sending message to backend:', error);
      setIsWaitingForResponse(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !inputMessage.trim() ||
      isWaitingForResponse ||
      (effectivePersonality === 'game_master' && Boolean(conversationId) && !characterState)
    ) return;

    // If no conversation exists, create one first
    if (!conversationId) {
      await handleNewConversation();
      // Wait a bit for the conversation to be created
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const userMessage = inputMessage;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputMessage('');

    await handleSendMessage(userMessage);
    // Assistant reply will come via subscription
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (
        inputMessage.trim() &&
        !isWaitingForResponse &&
        !(effectivePersonality === 'game_master' && Boolean(conversationId) && !characterState)
      ) {
        handleSubmit(e as React.FormEvent);
      }
    }
  };

  const handleSelectConversation = async (selectedConversationId: string) => {
    
    // If empty string, clear the conversation
    if (!selectedConversationId) {
      setConversationId(null);
      setMessages([]);
      setIsWaitingForResponse(false);
      setAdventureState(null);
      setQuestSteps([]);
      setPlayerChoices([]);
      setCharacterState(null);
      return;
    }
    
    setConversationId(selectedConversationId);
    setMessages([]); // Clear current messages
    
    // Load conversation data and messages
    try {
      // Load the conversation to get personality mode
      const { data: conversationData } = await dataClient.models.Conversation.get({
        id: selectedConversationId
      });
      
      if (conversationData) {
        const storedMode = conversationData.personalityMode || 'default';
        const normalizedMode = normalizePersonalityMode(storedMode);
        if (storedMode !== normalizedMode) {
          await dataClient.models.Conversation.update({
            id: selectedConversationId,
            personalityMode: normalizedMode,
          });
        }
        setPersonalityMode(normalizedMode);
        if (normalizedMode === 'game_master') {
          const character = await fetchCharacter(selectedConversationId);
          if (!character) {
            setMessages([]);
            setIsWaitingForResponse(false);
            return;
          }
          await fetchAdventureBundle(selectedConversationId);
        } else {
          setAdventureState(null);
          setQuestSteps([]);
          setPlayerChoices([]);
          setCharacterState(null);
        }
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
      
      // Scroll to bottom after messages load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
      
      // Set waiting state based on whether there's a pending message
      if (hasPendingMessage) {
        setIsWaitingForResponse(true);
      } else {
        setIsWaitingForResponse(false);
      }
      
      setMessages(timeline);
    } catch (error) {
      console.error('Error loading conversation messages:', error);
      setIsWaitingForResponse(false);
    }
  };

  const handleNewConversation = async () => {
    setIsModeDropdownOpen(false);
    await createConversationWithMode(effectivePersonality);
  };

  const createConversationWithMode = async (modeId: string) => {
    try {
      const normalized = normalizePersonalityMode(modeId);
      const defaultTitle = generateDefaultConversationTitle(normalized);
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
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
        setMessages([]);
        setPersonalityMode(normalized);
        setAdventureState(null);
        setQuestSteps([]);
        setPlayerChoices([]);
        setCharacterState(null);
        return;
      }

      // Get current user for participants
      const currentUserId = userAttributes?.sub || userAttributes?.email || 'anonymous';
      
      console.log('Creating new conversation with user:', currentUserId, 'mode:', normalized);
      
      const { data: newConversation } = await dataClient.models.Conversation.create({
        title: defaultTitle,
        participants: [currentUserId],
        personalityMode: normalized,
      });
      
      if (newConversation) {
        const createdId = newConversation.id;
        if (!createdId) {
          console.error('❌ Failed to create conversation: No ID returned');
          return;
        }

        setConversationId(createdId);
        setMessages([]);
        setPersonalityMode(normalized);
        console.log('✅ Created new conversation:', createdId);
        
        if (normalized === 'game_master') {
          await fetchAdventureBundle(createdId, normalized);
        } else {
          setAdventureState(null);
          setQuestSteps([]);
          setPlayerChoices([]);
          setCharacterState(null);
        }

      } else {
        console.error('❌ Failed to create conversation: No data returned');
      }
    } catch (error) {
      console.error('❌ Error creating new conversation:', error);
      // Don't throw the error to prevent breaking the UI
    }
  };

  const handleModeSelected = async (modeId: string) => {
    setIsModeDropdownOpen(false);
    await createConversationWithMode(modeId);
  };


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
      throw new Error('No active conversation for character creation');
    }
    await createCharacter(conversationId, characterData);
  }, [conversationId, createCharacter]);

  const handleCharacterCreationQuickStart = useCallback(async () => {
    if (!conversationId) {
      throw new Error('No active conversation for character creation');
    }
    const { calculateFinalStats } = await import('./game');
    const stats = calculateFinalStats('wanderer', 'human');
    await createCharacter(conversationId, {
      name: 'Adventurer',
      race: 'Human',
      characterClass: 'Wanderer',
      ...stats,
    });
  }, [conversationId, createCharacter]);

  const isGameMasterCharacterRequired = effectivePersonality === 'game_master' && Boolean(conversationId) && !characterState;
  const showInlineCharacterCreation = showCharacterCreation && Boolean(conversationId) && effectivePersonality === 'game_master';
  const isInputLocked = isWaitingForResponse || isGameMasterCharacterRequired;
  const gameMasterInputPlaceholder = isGameMasterCharacterRequired
    ? 'Create your character to begin your adventure...'
    : 'What do you do next?';
  const isGameMasterMode = effectivePersonality === 'game_master';

  const normalizedQuestSteps = useMemo(() => mapQuestStepsToHud(questSteps), [questSteps]);
  const normalizedPlayerChoices = useMemo(() => mapPlayerChoicesToHud(playerChoices), [playerChoices]);

  const derivedQuestSteps = useMemo(() => {
    if (normalizedQuestSteps.length > 0 || effectivePersonality !== 'game_master') return [];
    return deriveHudQuestStepsFromMessages(messages);
  }, [normalizedQuestSteps, messages, effectivePersonality]);

  const derivedPlayerChoices = useMemo(() => {
    if (normalizedPlayerChoices.length > 0 || effectivePersonality !== 'game_master') return [];
    return deriveHudPlayerChoicesFromMessages(messages);
  }, [normalizedPlayerChoices, messages, effectivePersonality]);

  const hudQuestSteps = normalizedQuestSteps.length > 0 ? normalizedQuestSteps : derivedQuestSteps;
  const hudPlayerChoices = normalizedPlayerChoices.length > 0 ? normalizedPlayerChoices : derivedPlayerChoices;
  const characterDisplay = useMemo(() => getCharacterData(), [getCharacterData]);
  const currentLocation = adventureState?.lastLocation || adventureState?.title || 'The Shrouded Vale';
  const goldPieces = useMemo(() => {
    return characterDisplay.inventory.reduce((total, item) => {
      if ((item.type === 'currency' || item.name.toLowerCase().includes('gold'))) {
        const quantity = Number(item.quantity ?? 0);
        if (Number.isFinite(quantity)) return total + quantity;
      }
      const parsed = item.name.match(/(\d+)\s*gold/i);
      if (parsed) return total + Number(parsed[1]);
      return total;
    }, 0);
  }, [characterDisplay.inventory]);
  const levelTarget = Math.max(characterDisplay.level * 100, 100);
  const levelProgress = Math.min(
    100,
    Math.max(0, ((Number(characterState?.experience ?? 0) % levelTarget) / levelTarget) * 100),
  );
  const latestDiceRoll = useMemo(() => {
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
  }, [messages]);
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
    ? 'retro-send-button-disabled bg-brand-surface-hover text-brand-text-muted cursor-not-allowed opacity-50'
    : isGameMasterMode
      ? 'retro-send-button-active-gm text-white shadow-lg hover:scale-105 hover:shadow-xl active:scale-95'
      : 'retro-send-button-active-brain text-white shadow-lg hover:scale-105 hover:shadow-xl active:scale-95';
  const keyboardHintKeyClass = 'retro-keycap px-1.5 py-0.5 rounded bg-brand-surface-elevated/50 border border-brand-surface-border/30 text-[10px] font-mono';

  return (
    <div className={`retro-rpg-ui h-screen overflow-hidden relative ${isGameMasterMode ? 'retro-rpg-ui--gm' : 'retro-rpg-ui--brain'}`}>


      {/* Desktop: Main Layout */}
      <div className="hidden lg:flex h-full retro-shell">
        {/* Main Content Area - Desktop */}
        <main 
          className="retro-main flex-1 flex flex-col min-w-0 overflow-hidden relative"
        >
          <nav className="retro-nav sticky top-0 z-40 bg-brand-surface-elevated/90 backdrop-blur-xl border-b border-brand-surface-border/40">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="retro-title text-lg font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNewConversation}
                  className="retro-icon-button w-9 h-9 rounded-lg flex items-center justify-center hover:bg-brand-surface-hover transition-colors"
                  aria-label="Start new conversation"
                >
                  <svg className="w-5 h-5 text-brand-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={handleSignOut}
                  className="retro-icon-button w-9 h-9 rounded-lg flex items-center justify-center hover:bg-brand-surface-hover transition-colors"
                  aria-label="Sign out"
                >
                  <svg className="w-5 h-5 text-brand-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </nav>

          {/* Screen reader live region for message updates */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {isWaitingForResponse && 'AI is thinking...'}
            {messages.length > 0 && `Interaction has ${messages.length} messages`}
          </div>

          <div className="retro-layout-grid flex flex-1 min-h-0 gap-4 px-4 pb-4">
            {conversationId && (
              <aside className="retro-frame retro-left-panel hidden lg:flex w-72 shrink-0 flex-col rounded-lg border border-brand-surface-border/40 bg-brand-surface-elevated/45 backdrop-blur-sm">
                <div
                  ref={desktopModeDropdownRef}
                  className={`retro-mode-header relative border-b px-5 py-4 ${isGameMasterMode ? 'border-amber-700/30' : 'border-brand-surface-border/40'}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModeDropdownOpen((prev) => !prev)}
                      className={`retro-mode-trigger flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                        isGameMasterMode
                          ? 'border-amber-500/50 bg-[#2f1e11]/70 hover:border-amber-400/70'
                          : 'border-brand-surface-border/60 bg-brand-bg-secondary/75 hover:border-brand-accent-primary/60'
                      }`}
                      aria-label="Select Brain or Game Master"
                    >
                      {isGameMasterMode ? (
                        <img src="/game-master.svg" alt="" aria-hidden="true" className="h-6 w-10 object-contain" />
                      ) : (
                        <BrainIcon className="h-6 w-6 text-brand-text-accent" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className={`retro-mode-title text-sm font-medium ${isGameMasterMode ? 'text-amber-100' : 'text-brand-text-primary'}`}>
                        {isGameMasterMode ? 'Game Master' : 'Brain'}
                      </p>
                    </div>
                  </div>

                  {isModeDropdownOpen && (
                    <div className="retro-dropdown absolute left-4 top-[calc(100%-6px)] z-30 w-64 rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/95 p-2 shadow-glass-lg backdrop-blur-xl">
                      <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.26em] text-brand-text-muted">Brain / Game Master</p>
                      {MODE_OPTIONS.map((option) => {
                        const isActive = option.id === effectivePersonality;
                        const isGameMasterOption = option.id === 'game_master';

                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleModeSelected(option.id)}
                            className={`retro-dropdown-item flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                              isActive ? 'bg-brand-accent-primary/15' : 'hover:bg-brand-surface-hover'
                            }`}
                          >
                            <span
                              className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                                isGameMasterOption
                                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                                  : 'border-violet-400/60 bg-violet-500/15 text-violet-100'
                              }`}
                            >
                              {isGameMasterOption ? (
                                <img src="/game-master.svg" alt="" aria-hidden="true" className="h-5 w-8 object-contain" />
                              ) : (
                                <BrainIcon className="h-5 w-5" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-brand-text-primary">{option.shortLabel}</p>
                              <p className="text-[11px] text-brand-text-muted">{option.badge}</p>
                            </div>
                            {isActive && (
                              <svg className="h-4 w-4 text-brand-accent-primary" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8.5 12.086 5.707 9.293a1 1 0 00-1.414 1.414l3.5 3.5a1 1 0 001.414 0l7.5-7.5a1 1 0 000-1.414z" clipRule="evenodd" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {isGameMasterMode ? (
                  <>
                    <div className="flex-1 px-4 py-5 text-amber-50">
                      <p className="text-center text-[11px] uppercase tracking-[0.26em] text-amber-200/75">Character Sheet</p>
                      <div className="mt-4 flex justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/60 bg-[#2f1e11]/70 text-2xl font-semibold text-amber-200">
                          {(characterDisplay.name || 'A').slice(0, 1).toUpperCase()}
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {['🎒', '📘', '❓', '⚙️'].map((icon) => (
                          <div
                            key={icon}
                            className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-amber-700/45 bg-[#24170e]/70 text-xl"
                          >
                            <span aria-hidden="true">{icon}</span>
                          </div>
                        ))}
                      </div>

                      <p className="mt-5 text-center text-sm text-amber-300">Gold: {goldPieces} gp</p>

                      <div className="mt-4 rounded-md border border-amber-700/45 bg-[#19110b]/80 p-3 text-center">
                        <p className="text-6xl font-semibold leading-none text-amber-100">{characterDisplay.level}</p>
                        <p className="mt-2 text-sm text-amber-100/90">{characterDisplay.name || 'Adventurer'}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-amber-200/70">
                          {characterDisplay.characterClass || 'Wanderer'} • Level {characterDisplay.level}
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/35">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-600 to-yellow-400 transition-all duration-500"
                            style={{ width: `${levelProgress}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[11px] text-amber-100/70">Next Level: {Number(characterState?.experience ?? 0)} / {levelTarget}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 space-y-5 px-5 py-5 text-brand-text-primary">
                      <p className="text-[11px] uppercase tracking-[0.26em] text-brand-text-muted">Mind Profile</p>

                      <div className="space-y-2 text-sm">
                        <div className="rounded-md border border-brand-surface-border/50 bg-brand-bg-secondary/50 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-brand-text-muted">Current State</p>
                          <p className="mt-1 font-medium text-brand-text-primary">{mentalStateLabel}</p>
                        </div>
                        <div className="rounded-md border border-brand-surface-border/50 bg-brand-bg-secondary/50 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-brand-text-muted">Resonance</p>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-bg-primary">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 transition-all duration-500"
                              style={{ width: `${mentalStateIntensity}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-brand-text-muted">Intensity: {Math.round(mentalStateIntensity)}%</p>
                        </div>
                      </div>

                      {effectivePersonality !== 'default' && (
                        <PersonalityIndicator personality={effectivePersonality} />
                      )}
                    </div>
                  </>
                )}
              </aside>
            )}

            <div className="flex-1 flex flex-col min-h-0">
              {/* Enhanced Chat Area with glass morphism design */}
              {/* Messages with improved styling and animations */}
                <div
                  ref={desktopScrollContainerRef}
                  className={`retro-frame retro-scroll-panel flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-brand-surface-tertiary ${
                    isGameMasterMode
                      ? 'rounded-lg border border-amber-700/30 bg-[#1d140d]/70 px-6 py-6'
                      : 'rounded-lg border border-brand-surface-border/35 bg-brand-surface-elevated/30 px-6 py-6'
                  }`}
                >
                <div className={`mx-auto max-w-4xl space-y-6 flex flex-col transition-all duration-300 ${isGameMasterMode ? 'font-serif' : ''}`}>
                  {showInlineCharacterCreation && (
                    <div className="mx-auto w-full max-w-xl">
                      <CharacterCreation
                        inline
                        onComplete={handleCharacterCreationComplete}
                        onCancel={handleCharacterCreationQuickStart}
                      />
                    </div>
                  )}
                  {conversationId && isGameMasterMode && (
                    <div className="retro-status-strip rounded-md border border-amber-700/40 bg-gradient-to-r from-[#2b1711]/70 via-[#531916]/40 to-[#2b1711]/70 px-4 py-3">
                      <div className="grid grid-cols-3 items-end text-center">
                        <div className="text-left">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/75">Day</p>
                          <p className="text-lg text-amber-100">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/75">Location</p>
                          <p className="text-lg text-amber-100">{currentLocation}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/75">Act</p>
                          <p className="text-lg text-amber-100">{characterDisplay.level >= 5 ? 'II' : 'I'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Personality Indicator (mobile only) */}
                  {conversationId && effectivePersonality !== 'default' && (
                    <div className="lg:hidden">
                      <PersonalityIndicator personality={effectivePersonality} />
                    </div>
                  )}

                  {conversationId && effectivePersonality === 'game_master' && adventureState && (
                    <div className="lg:hidden">
                      <GameMasterHud
                        adventure={adventureState}
                        questSteps={hudQuestSteps}
                        playerChoices={hudPlayerChoices}
                        character={characterState}
                        isLoadingCharacter={isLoadingCharacter}
                        onUpdateInventory={updateInventory}
                      />
                    </div>
                  )}
              
                  {messages.length === 0 && !isLoading && conversationId && (
                    <div className="flex justify-center items-center h-full min-h-[300px]">
                      <div className="text-center space-y-3 mt-64">
                        <div className="text-xs uppercase tracking-[0.4em] text-brand-text-muted">Idle Interaction</div>
                        <div className="w-16 h-1 mx-auto bg-gradient-to-r from-transparent via-brand-accent-primary/60 to-transparent rounded-full" />
                      </div>
                    </div>
                  )}
              
                  {isLoading && (
                    <div className="flex justify-center items-center h-full min-h-[200px]">
                      <div className="text-slate-400 flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading...
                      </div>
                    </div>
                  )}
              
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`retro-message-row flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="retro-avatar retro-avatar-assistant w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm animate-float">
                          <BrainIcon className="w-4 h-4 text-white" />
                        </div>
                      )}
                  
                      <div 
                        ref={(el) => {
                          if (el && message.role === 'assistant') {
                            messageContainerRefs.current.set(index, el);
                          }
                        }}
                        className="flex flex-col gap-2 max-w-[85%] sm:max-w-[75%]"
                      >
                        <div
                          className={`retro-message message-bubble backdrop-blur-sm transition-all duration-300 animate-slide-up ${
                            `rounded-2xl px-4 py-3 hover:scale-[1.02] ${
                              message.role === 'user'
                                ? 'retro-message-user bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple hover:shadow-glow-lg'
                                : isGameMasterMode
                                  ? 'retro-message-assistant-gm border border-amber-700/40 bg-[#24180d]/75 text-amber-100 shadow-glass-lg hover:shadow-neon-blue'
                                  : 'retro-message-assistant glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg hover:shadow-neon-blue'
                            } ${message.role === 'assistant' ? 'cursor-pointer' : ''}`
                          }`}
                          onClick={() => {
                            if (message.role === 'assistant' && !isGameMasterMode) {
                              setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                            }
                          }}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap break-words">
                            {isGameMasterMode && (
                              <span className={`mb-1 block text-[11px] uppercase tracking-[0.22em] ${
                                message.role === 'user' ? 'text-cyan-300/75' : 'text-amber-300/75'
                              }`}>
                                {message.role === 'user' ? 'Player Action' : 'Narrator'}
                              </span>
                            )}
                            {message.content}
                            {message.isTyping && (
                              <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                            )}
                          </p>
                        </div>
                    
                        {/* Show additional details when expanded */}
                        {message.role === 'assistant' && expandedMessageIndex === index && !isGameMasterMode && (
                          <div className="mt-4 space-y-3 animate-slide-up">
                            {/* Sensations */}
                            {message.sensations && message.sensations.length > 0 && (
                              <div className="rounded-lg p-3 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                                <div className="font-medium text-purple-300 mb-2 flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                              Sensations
                                </div>
                                <ul className="text-brand-text-muted text-sm space-y-1.5 ml-6">
                                  {message.sensations.map((sensation, i) => (
                                    <li key={i} className="leading-relaxed">• {sensation}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        
                            {/* Thoughts */}
                            {message.thoughts && message.thoughts.length > 0 && (
                              <div className="rounded-lg p-3 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                                <div className="font-medium text-blue-300 mb-2 flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                              Thoughts
                                </div>
                                <ul className="text-brand-text-muted text-sm space-y-1.5 ml-6">
                                  {message.thoughts.map((thought, i) => (
                                    <li key={i} className="leading-relaxed">• {thought}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        
                            {/* Memories */}
                            {message.memories && message.memories.trim() && (
                              <div className="rounded-lg p-3 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                                <div className="font-medium text-green-300 mb-2 flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                  </svg>
                              Memories
                                </div>
                                <p className="text-brand-text-muted text-sm leading-relaxed">{message.memories}</p>
                              </div>
                            )}
                        
                            {/* Self Reflection */}
                            {message.selfReflection && message.selfReflection.trim() && (
                              <div className="rounded-lg p-3 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                                <div className="font-medium text-violet-300 mb-2 flex items-center gap-2 text-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                              Self Reflection
                                </div>
                                <p className="text-brand-text-muted text-sm leading-relaxed">{message.selfReflection}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                  
                      {message.role === 'user' && (
                        <div className="retro-avatar retro-avatar-user w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass hover:shadow-glow-sm transition-all duration-300">
                          <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
              
                  {isWaitingForResponse && (
                    <div className="retro-waiting-row flex gap-4 justify-start animate-slide-up">
                      <div className="retro-avatar retro-avatar-assistant w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                        <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                      </div>
                      <div className={`retro-message retro-waiting-bubble glass border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg ${isGameMasterMode ? 'text-amber-100' : 'text-brand-text-primary'}`}>
                        <div className="flex items-center gap-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                          </div>
                          <span className={`text-sm ${isGameMasterMode ? 'text-amber-200/80' : 'text-brand-text-muted'}`}>
                            {isGameMasterMode ? 'The world shifts around your decision...' : 'Brain is thinking...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
              
                  {/* Enhanced Debug info - now toggleable */}
                  {showDebugInfo && (
                    <div className="mt-6 glass rounded-2xl p-4 animate-fade-in">
                      <h3 className="text-sm font-medium text-brand-text-primary mb-2">Debug Information</h3>
                      <div className="text-xs text-brand-text-muted space-y-1">
                        <p>Interaction ID: {conversationId || 'None'}</p>
                        <p>User: {userAttributes?.sub || 'Unknown'}</p>
                        <p>Waiting for response: {isWaitingForResponse ? 'Yes' : 'No'}</p>
                        <p>Messages count: {messages.length}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Invisible element to scroll to - at the bottom */}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Modern Input Area */}
              <div className="retro-input-dock sticky bottom-0 left-0 right-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary to-transparent pt-6 pb-4 px-4 sm:px-6">
                <div className="mx-auto max-w-4xl transition-all duration-300">
                  <form onSubmit={handleSubmit} className="relative">
                    <div className={`retro-input-shell flex gap-2 items-end p-2 transition-all duration-200 ${
                      isGameMasterMode
                        ? 'rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/80 backdrop-blur-xl shadow-lg focus-within:border-amber-500/50 focus-within:shadow-xl'
                        : 'rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/80 backdrop-blur-xl shadow-lg focus-within:border-brand-accent-primary/50 focus-within:shadow-xl'
                    }`}>
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
                                : 'Start a new conversation...'
                          }
                          className="retro-input-textarea w-full px-3 py-3 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-[15px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                          disabled={isInputLocked}
                          rows={1}
                          style={{ 
                            maxHeight: '160px',
                            minHeight: '48px',
                            height: 'auto'
                          }}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, 160) + 'px';
                          }}
                        />
                      </div>

                      {/* Send Button */}
                      <button
                        type="submit"
                        className={`retro-send-button flex-shrink-0 rounded-xl p-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                          isGameMasterMode ? 'focus:ring-amber-500/50 focus:ring-offset-brand-bg-primary' : 'focus:ring-brand-accent-primary/50 focus:ring-offset-brand-bg-primary'
                        }
                        ${sendButtonStateClass}`}
                        disabled={!inputMessage.trim() || isInputLocked}
                        aria-label={isInputLocked ? 'Sending message' : 'Send message'}
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

                    {/* Keyboard hint */}
                    {!isInputLocked && (
                      <div className="mt-2 text-center">
                        <p className="text-xs text-brand-text-muted/50">
                      Press <kbd className={keyboardHintKeyClass}>Enter</kbd> to send, <kbd className={keyboardHintKeyClass}>Shift+Enter</kbd> for new line
                        </p>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>

            {conversationId && (
              <aside className="retro-frame retro-right-panel hidden lg:flex w-80 shrink-0 flex-col rounded-lg border border-brand-surface-border/40 bg-brand-surface-elevated/45 backdrop-blur-sm text-brand-text-primary">
                {isGameMasterMode ? (
                  <div className="flex h-full flex-col gap-4 p-4 retro-right-stack">
                    <div className="retro-location-card overflow-hidden rounded-md border border-amber-700/35">
                      <div className="h-56 bg-cover bg-center" style={{ backgroundImage: 'url(/fantasy-location.svg)' }} />
                      <div className="border-t border-amber-700/35 bg-[#281b10]/90 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/75">Current Location</p>
                        <p className="mt-1 font-serif text-lg text-amber-100">{currentLocation}</p>
                      </div>
                    </div>

                    <div className="retro-dice-panel mt-auto relative overflow-hidden rounded-md border border-amber-700/45 bg-gradient-to-b from-[#0f0f13] to-[#1a130c] p-4 text-center">
                      <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[92px] font-black leading-none text-amber-100/8">
                        ROLL
                      </p>
                      <p className="relative text-[10px] uppercase tracking-[0.24em] text-amber-300/75">Latest Roll</p>
                      <div className="relative mt-2 text-7xl font-semibold leading-none text-amber-100 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]">
                        {latestDiceRoll || '—'}
                      </div>
                      <p className="relative mt-2 text-xs text-amber-100/70">
                        {adventureState?.title ? `Thread: ${adventureState.title}` : 'Fortune favors the bold.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col gap-4 p-4">
                    <div className="rounded-md border border-brand-surface-border/50 bg-brand-bg-secondary/60 p-4 text-center">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-brand-text-muted">Cognitive Projection</p>
                      <img
                        src="/brain.svg"
                        alt="Floating brain icon"
                        className="mx-auto mt-4 h-32 w-32 animate-float opacity-95"
                      />
                    </div>

                    <div className="rounded-md border border-brand-surface-border/50 bg-brand-bg-secondary/60 p-4">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-brand-text-muted">Current Mental State</p>
                      <p className="mt-2 text-lg font-medium text-brand-text-primary">{mentalStateLabel}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-bg-primary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 transition-all duration-500"
                          style={{ width: `${mentalStateIntensity}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-brand-text-muted">Intensity: {Math.round(mentalStateIntensity)}%</p>
                    </div>

                    {conversationId && effectivePersonality !== 'default' && (
                      <PersonalityIndicator personality={effectivePersonality} />
                    )}
                  </div>
                )}
              </aside>
            )}
          </div>
          
        </main>
      </div>

      {/* Mobile: Main Content Area */}
      <main 
        className="retro-mobile-main lg:hidden flex flex-col h-full"
      >
        {/* Mobile Top Nav Bar */}
        <nav className="retro-nav retro-mobile-nav sticky top-0 z-[60] bg-brand-surface-elevated/95 backdrop-blur-xl border-b border-brand-surface-border/50 shadow-lg pt-safe">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="retro-title text-lg font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleNewConversation}
                  className="retro-icon-button w-9 h-9 rounded-lg flex items-center justify-center hover:bg-brand-surface-hover transition-colors"
                  aria-label="Start new conversation"
                >
                  <svg className="w-5 h-5 text-brand-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={handleSignOut}
                  className="retro-icon-button w-9 h-9 rounded-lg flex items-center justify-center hover:bg-brand-surface-hover transition-colors"
                  aria-label="Sign out"
                >
                  <svg className="w-5 h-5 text-brand-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>

            <div ref={mobileModeDropdownRef} className="retro-mobile-mode relative">
              <button
                type="button"
                onClick={() => setIsModeDropdownOpen((prev) => !prev)}
                className={`retro-mode-trigger w-full flex items-center justify-between rounded-xl border px-3 py-2 transition-colors ${
                  isGameMasterMode
                    ? 'border-amber-700/40 bg-[#2f1e11]/35'
                    : 'border-brand-surface-border/50 bg-brand-bg-secondary/35'
                }`}
                aria-label="Select Brain or Game Master"
              >
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                    isGameMasterMode
                      ? 'border-amber-500/60 bg-amber-500/20 text-amber-100'
                      : 'border-violet-400/60 bg-violet-500/20 text-violet-100'
                  }`}>
                    {isGameMasterMode ? (
                      <img src="/game-master.svg" alt="" aria-hidden="true" className="h-4 w-7 object-contain" />
                    ) : (
                      <BrainIcon className="h-5 w-5" />
                    )}
                  </span>
                  <div className="text-left">
                    <p className={`text-sm ${isGameMasterMode ? 'text-amber-100' : 'text-brand-text-primary'}`}>
                      {isGameMasterMode ? 'Game Master' : 'Brain'}
                    </p>
                  </div>
                </div>
                <svg className={`w-4 h-4 text-brand-text-muted transition-transform ${isModeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isModeDropdownOpen && (
                <div className="retro-dropdown retro-dropdown-mobile absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-brand-surface-border/50 bg-brand-surface-elevated/95 p-2 shadow-glass-lg backdrop-blur-xl">
                  <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.26em] text-brand-text-muted">Brain / Game Master</p>
                  {MODE_OPTIONS.map((option) => {
                    const isActive = option.id === effectivePersonality;
                    const isGameMasterOption = option.id === 'game_master';

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleModeSelected(option.id)}
                        className={`retro-dropdown-item flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                          isActive ? 'bg-brand-accent-primary/15' : 'hover:bg-brand-surface-hover'
                        }`}
                      >
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                            isGameMasterOption
                              ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                              : 'border-violet-400/60 bg-violet-500/15 text-violet-100'
                          }`}
                        >
                          {isGameMasterOption ? (
                            <img src="/game-master.svg" alt="" aria-hidden="true" className="h-5 w-8 object-contain" />
                          ) : (
                            <BrainIcon className="h-5 w-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-brand-text-primary">{option.shortLabel}</p>
                          <p className="text-[11px] text-brand-text-muted">{option.badge}</p>
                        </div>
                        {isActive && (
                          <svg className="h-4 w-4 text-brand-accent-primary" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8.5 12.086 5.707 9.293a1 1 0 00-1.414 1.414l3.5 3.5a1 1 0 001.414 0l7.5-7.5a1 1 0 000-1.414z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </nav>

        {/* Floating Expandable Header Bars - Side by Side - Only for Game Master mode */}
        {effectivePersonality === 'game_master' && characterState && (
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
                        {adventureState ? (
                          <p className="text-sm text-brand-text-primary font-medium truncate">
                            {adventureState.title}
                          </p>
                        ) : null}
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-brand-text-muted uppercase tracking-wider">Character</p>
                        <p className="text-sm text-brand-text-primary font-medium truncate">Stats & Inventory</p>
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
                  {mobileCharSheetExpanded && adventureState && !isLoadingCharacter && characterState && (() => {
                    const charData = getCharacterData();
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
          {messages.length > 0 && `Interaction has ${messages.length} messages`}
        </div>

        {/* Enhanced Chat Area with glass morphism design */}
        <div className="retro-chat-area flex-1 flex flex-col min-h-0">
          {/* Messages with improved styling and animations */}
          <div className="retro-scroll-panel flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-brand-surface-tertiary flex flex-col">
            <div className="max-w-4xl mx-auto space-y-4 flex flex-col">
              {showInlineCharacterCreation && (
                <div className="mx-auto w-full max-w-xl pb-2">
                  <CharacterCreation
                    inline
                    onComplete={handleCharacterCreationComplete}
                    onCancel={handleCharacterCreationQuickStart}
                  />
                </div>
              )}
              
              {messages.length === 0 && !isLoading && conversationId && !showInlineCharacterCreation && (
                <div className="flex justify-center items-center h-full min-h-[300px]">
                  <div className="retro-empty-state text-center space-y-3 px-4 mt-64">
                    <div className="text-xs uppercase tracking-[0.4em] text-brand-text-muted">Idle Interaction</div>
                    <div className="w-16 h-1 mx-auto bg-gradient-to-r from-transparent via-brand-accent-primary/60 to-transparent rounded-full" />
                  </div>
                </div>
              )}
              
              {isLoading && (
                <div className="flex justify-center items-center h-full min-h-[200px]">
                  <div className="text-slate-400 flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading...
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`retro-message-row flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="retro-avatar retro-avatar-assistant w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm">
                      <BrainIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div 
                    ref={(el) => {
                      if (el && message.role === 'assistant') {
                        messageContainerRefs.current.set(index, el);
                      }
                    }}
                    className="flex flex-col gap-2 max-w-[85%]"
                  >
                    <div
                      className={`retro-message message-bubble rounded-2xl px-4 py-3 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] animate-slide-up ${
                        message.role === 'user'
                          ? 'retro-message-user bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple'
                          : isGameMasterMode
                            ? 'retro-message-assistant-gm border border-amber-700/40 bg-[#24180d]/75 text-amber-100 shadow-glass-lg'
                            : 'retro-message-assistant glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg'
                      } ${message.role === 'assistant' && !isGameMasterMode ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (message.role === 'assistant' && !isGameMasterMode) {
                          setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                        }
                      }}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap break-words text-sm">
                        {isGameMasterMode && (
                          <span className={`mb-1 block text-[10px] uppercase tracking-[0.2em] ${
                            message.role === 'user' ? 'text-cyan-300/75' : 'text-amber-300/75'
                          }`}>
                            {message.role === 'user' ? 'Player Action' : 'Narrator'}
                          </span>
                        )}
                        {message.content}
                        {message.isTyping && (
                          <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                        )}
                      </p>
                    </div>
                    
                    {/* Show additional details when expanded */}
                    {message.role === 'assistant' && expandedMessageIndex === index && !isGameMasterMode && (
                      <div className="mt-3 space-y-2.5 animate-slide-up">
                        {/* Sensations */}
                        {message.sensations && message.sensations.length > 0 && (
                          <div className="rounded-lg p-2.5 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                            <div className="font-medium text-purple-300 mb-1.5 flex items-center gap-1.5 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Sensations
                            </div>
                            <ul className="text-brand-text-muted text-xs space-y-1 ml-5">
                              {message.sensations.map((sensation, i) => (
                                <li key={i} className="leading-relaxed">• {sensation}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Thoughts */}
                        {message.thoughts && message.thoughts.length > 0 && (
                          <div className="rounded-lg p-2.5 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                            <div className="font-medium text-blue-300 mb-1.5 flex items-center gap-1.5 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                              Thoughts
                            </div>
                            <ul className="text-brand-text-muted text-xs space-y-1 ml-5">
                              {message.thoughts.map((thought, i) => (
                                <li key={i} className="leading-relaxed">• {thought}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Memories */}
                        {message.memories && message.memories.trim() && (
                          <div className="rounded-lg p-2.5 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                            <div className="font-medium text-green-300 mb-1.5 flex items-center gap-1.5 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                              </svg>
                              Memories
                            </div>
                            <p className="text-brand-text-muted text-xs leading-relaxed">{message.memories}</p>
                          </div>
                        )}
                        
                        {/* Self Reflection */}
                        {message.selfReflection && message.selfReflection.trim() && (
                          <div className="rounded-lg p-2.5 bg-brand-surface-elevated/30 border border-brand-surface-border/50">
                            <div className="font-medium text-violet-300 mb-1.5 flex items-center gap-1.5 text-xs">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Self Reflection
                            </div>
                            <p className="text-brand-text-muted text-xs leading-relaxed">{message.selfReflection}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="retro-avatar retro-avatar-user w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass">
                      <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="retro-waiting-row flex gap-3 justify-start animate-slide-up">
                  <div className="retro-avatar retro-avatar-assistant w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                    <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                  </div>
                  <div className={`retro-message retro-waiting-bubble glass border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg ${isGameMasterMode ? 'text-amber-100' : 'text-brand-text-primary'}`}>
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                      </div>
                      <span className={`text-sm ${isGameMasterMode ? 'text-amber-200/80' : 'text-brand-text-muted'}`}>
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
          <div className="retro-input-dock sticky bottom-0 left-0 right-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary to-transparent pt-4 pb-4 px-3 pb-safe">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
                <div className={`retro-input-shell flex gap-2 items-end bg-brand-surface-elevated/80 backdrop-blur-xl rounded-2xl border border-brand-surface-border/50 p-2 shadow-lg transition-all duration-200 ${
                  isGameMasterMode ? 'focus-within:border-amber-500/50' : 'focus-within:border-brand-accent-primary/50'
                } focus-within:shadow-xl`}>
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
                            : 'Start a new conversation...'
                      }
                      className="retro-input-textarea w-full px-3 py-2.5 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-sm leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                      disabled={isInputLocked}
                      rows={1}
                      style={{ 
                        maxHeight: '120px',
                        minHeight: '44px',
                        height: 'auto'
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                  </div>

                  {/* Send Button */}
                  <button
                    type="submit"
                    className={`retro-send-button flex-shrink-0 p-2.5 rounded-xl transition-all duration-200 focus:outline-none active:scale-95 ${sendButtonStateClass}`}
                    disabled={!inputMessage.trim() || isInputLocked}
                    aria-label={isInputLocked ? 'Sending message' : 'Send message'}
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
