import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { fetchUserAttributes, signOut } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import ConversationList from './components/ConversationList';
import BrainIcon from './components/BrainIcon';
import PersonalityIndicator from './components/PersonalityIndicator';
import InstallPrompt from './components/InstallPrompt';
import WipBanner from './components/WipBanner';
import CharacterCreation from './components/CharacterCreation';
import { MODE_OPTIONS, normalizePersonalityMode } from './constants/personalityModes';
import type { PersonalityModeId } from './constants/personalityModes';
import { featureFlags } from './featureFlags';
const dataClient = generateClient<Schema>();

type AdventureRecord = Schema['GameMasterAdventure']['type'];
type QuestStepRecord = Schema['GameMasterQuestStep']['type'];
type PlayerChoiceRecord = Schema['GameMasterPlayerChoice']['type'];
type CharacterRecord = Schema['GameMasterCharacter']['type'];

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
}

function GameMasterHud({ adventure, questSteps, playerChoices, character, isLoadingCharacter }: GameMasterHudProps) {
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
  
  // Parse inventory JSON string to array
  let inventory: string[] = [];
  if (character.inventory) {
    try {
      const parsed = typeof character.inventory === 'string' 
        ? JSON.parse(character.inventory) 
        : character.inventory;
      inventory = Array.isArray(parsed) ? parsed : [];
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
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-brand-text-muted mb-2">Inventory</p>
            <div className="space-y-1">
              {inventory.map((item, index) => (
                <div key={index} className="text-xs text-brand-text-secondary">• {item}</div>
              ))}
            </div>
          </div>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false);
  const [mobileCharSheetExpanded, setMobileCharSheetExpanded] = useState(false);
  const [conversationListKey, setConversationListKey] = useState(0);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [expandedMessageIndex, setExpandedMessageIndex] = useState<number | null>(null); // Track which message's details are shown
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  
  // Swipe gesture state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
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
    
    let inventory: string[] = ['Rusty Sword', 'Leather Armor', '5 Gold'];
    if (characterState?.inventory) {
      try {
        const parsed = typeof characterState.inventory === 'string' 
          ? JSON.parse(characterState.inventory) 
          : characterState.inventory;
        inventory = Array.isArray(parsed) ? parsed : inventory;
      } catch (e) {
        console.error('Failed to parse inventory:', e);
      }
    }
    
    return {
      name: characterState?.name || 'Adventurer',
      level: characterState?.level || 1,
      stats,
      hp,
      inventory,
    };
  }, [characterState]);
  
  // Personality mode state
  const [personalityMode, setPersonalityMode] = useState<string>('default');
  const effectivePersonality = normalizePersonalityMode(personalityMode);
  
  // Swipe gesture handlers
  const minSwipeDistance = 50;
  const edgeThreshold = 50; // Must start swipe within 50px from left edge

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    const touch = e.targetTouches[0];
    if (touch.clientX <= edgeThreshold) { // Only detect swipes starting from left edge
      setTouchStart(touch.clientX);
    } else {
      setTouchStart(null);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchEnd - touchStart;
    const isRightSwipe = distance > minSwipeDistance;
    const isLeftSwipe = distance < -minSwipeDistance;
    
    if (isRightSwipe && !isSidebarOpen) {
      setIsSidebarOpen(true);
    } else if (isLeftSwipe && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
    
    setTouchStart(null);
    setTouchEnd(null);
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

  const fetchCharacter = useCallback(async (convId: string, retryCount = 0) => {
    // Prevent duplicate creation with ref-based lock
    if (characterCreationLock.current) {
      console.log('⏸️ Character fetch already in progress');
      return;
    }
    
    setIsLoadingCharacter(true);
    
    try {
      console.log('🔍 Fetching character for conversation:', convId, 'retry:', retryCount);
      
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
          console.log('🔍 After client-side filter:', data.length, 'characters match conversationId');
        }
      } catch (authError) {
        console.log('userPool auth failed, trying without authMode');
        const result = await dataClient.models.GameMasterCharacter.list({
          limit: 1000,
        });
        data = result.data;
        errors = result.errors;
        
        // Filter client-side
        if (data) {
          data = data.filter(char => char.conversationId === convId);
          console.log('🔍 After client-side filter:', data.length, 'characters match conversationId');
        }
      }
      
      if (errors && errors.length > 0) {
        console.error('Error fetching character:', errors);
      }
      
      console.log('📋 Character fetch result:', data?.length, 'characters found', data);
      
      if (data && data.length > 0 && data[0]) {
        console.log('✅ Character exists, loading:', data[0].id);
        setCharacterState(data[0] as CharacterRecord);
        setShowCharacterCreation(false);
        setIsLoadingCharacter(false);
        return;
      }
      
      // Retry up to 2 times with delay if no character found (database propagation)
      if (retryCount < 2) {
        console.log('⏳ Retrying character fetch in 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchCharacter(convId, retryCount + 1);
      }
      
      // No character exists after retries - show character creation modal
      console.log('📝 No character found after retries - showing creation modal');
      setIsLoadingCharacter(false);
      setShowCharacterCreation(true);
    } catch (error) {
      console.error('❌ Error loading character:', error);
      setIsLoadingCharacter(false);
      characterCreationLock.current = false;
    }
  }, []);

  const createCharacter = useCallback(async (convId: string, characterData: {
    name: string;
    race: string;
    characterClass: string;
    strength?: number;
    dexterity?: number;
    constitution?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  }) => {
    if (characterCreationLock.current) {
      return;
    }
    
    characterCreationLock.current = true;
    
    try {
      const created = await dataClient.models.GameMasterCharacter.create({
        adventureId: 'placeholder',
        conversationId: convId,
        name: characterData.name,
        race: characterData.race,
        characterClass: characterData.characterClass,
        level: 1,
        experience: 0,
        strength: characterData.strength || 10,
        dexterity: characterData.dexterity || 12,
        constitution: characterData.constitution || 14,
        intelligence: characterData.intelligence || 16,
        wisdom: characterData.wisdom || 13,
        charisma: characterData.charisma || 11,
        maxHP: 12,
        currentHP: 12,
        armorClass: 10,
        inventory: JSON.stringify(['Rusty Sword', 'Leather Armor', '5 Gold']),
        skills: JSON.stringify({}),
        statusEffects: JSON.stringify([]),
        version: 1,
      });
      
      console.log('💾 Character create result:', created);
      console.log('💾 Saved character with conversationId:', convId);
      
      if (created.data) {
        console.log('💾 Character saved to DB:', {
          id: created.data.id,
          conversationId: created.data.conversationId,
          name: created.data.name,
        });
        setCharacterState(created.data as CharacterRecord);
        setShowCharacterCreation(false);
        // Small delay to ensure database write propagates
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (created.errors) {
        console.error('Character creation failed:', created.errors);
        throw new Error('Failed to create character');
      }
    } catch (createError) {
      console.error('❌ Error during character creation:', createError);
      throw createError;
    } finally {
      characterCreationLock.current = false;
    }
  }, []);

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
      const adventure = await ensureAdventureState(convId, activeMode);
      if (!adventure || !adventure.id) {
        adventureFetchLock.current = null;
        return;
      }
      const adventureId = adventure.id as string;
      
      // Fetch character when adventure is loaded - pass conversationId instead
      await fetchCharacter(convId);
      
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
    if (!inputMessage.trim() || isWaitingForResponse) return;

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
      if (inputMessage.trim() && !isWaitingForResponse) {
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

  const handleNewConversation = () => {
    setIsModePickerOpen(true);
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
        setConversationListKey(prev => prev + 1);
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

        setConversationListKey(prev => prev + 1);
      } else {
        console.error('❌ Failed to create conversation: No data returned');
      }
    } catch (error) {
      console.error('❌ Error creating new conversation:', error);
      // Don't throw the error to prevent breaking the UI
    }
  };

  const handleModeSelected = async (modeId: string) => {
    setIsModePickerOpen(false);
    setIsSidebarOpen(false); // Close sidebar when starting new conversation
    await createConversationWithMode(modeId);
  };

  const handleModePickerClose = () => {
    setIsModePickerOpen(false);
  };

  const handleDeleteConversation = async (conversationIdToDelete: string) => {
    try {
      console.log('🗑️ Deleting conversation:', conversationIdToDelete);
      
      // For development testing, just clear from local state
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
        console.log('✅ Test mode: Removing conversation from local state');
        
        // If this was the current conversation, clear it
        if (conversationIdToDelete === conversationId) {
          setConversationId(null);
          setMessages([]);
        }
        
        // Trigger a refresh of the conversation list
        setConversationListKey(prev => prev + 1);
        return;
      }

      // Delete from database
      await dataClient.models.Conversation.delete({ id: conversationIdToDelete });
      
      // If this was the current conversation, clear it
      if (conversationIdToDelete === conversationId) {
        setConversationId(null);
        setMessages([]);
      }
      
      // Trigger a refresh of the conversation list
      setConversationListKey(prev => prev + 1);
      
      console.log('✅ Deleted conversation:', conversationIdToDelete);
    } catch (error) {
      console.error('❌ Error deleting conversation:', error);
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

  const hasPersonalityPanel = effectivePersonality !== 'default';
  const hasAdventurePanel = effectivePersonality === 'game_master' && Boolean(adventureState);
  const hasSidebarContent = Boolean(
    conversationId && (hasPersonalityPanel || hasAdventurePanel)
  );

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

  return (
    <div className="h-screen bg-gradient-to-br from-brand-bg-primary via-brand-bg-secondary to-brand-bg-tertiary overflow-hidden relative">


      {/* Mobile: Full-screen Overlay Menu */}
      <div
        className={`lg:hidden fixed inset-0 z-[50] transition-all duration-300 ${
          isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        {/* Full screen overlay that covers entire screen */}
        <div
          className={`absolute inset-0 bg-brand-background/98 backdrop-blur-xl transform transition-all duration-300 ${
            isSidebarOpen ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
          }`}
        >
          <div className="flex flex-col h-full pt-20">
            {/* Mobile Menu Content */}
            <nav className="flex-1 overflow-y-auto p-4" aria-label="Interactions">
              <ConversationList 
                onSelectConversation={(id) => {
                  handleSelectConversation(id);
                  setIsSidebarOpen(false); // Close menu after selection on mobile
                }}
                onDeleteConversation={handleDeleteConversation}
                onNewConversation={() => {
                  handleNewConversation();
                }}
                selectedConversationId={conversationId}
                refreshKey={conversationListKey}
              />
            </nav>

            {/* Mobile Menu Footer with Sign Out */}
            <div className="border-t border-brand-surface-border p-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSignOut();
                  setIsSidebarOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl
                text-brand-text-muted hover:text-brand-text-primary transition-all duration-200
                hover:bg-brand-surface-hover/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: Sidebar Layout */}
      <div className="hidden lg:flex h-full">
        {/* Desktop Sidebar - Collapsible */}
        <aside
          className={`flex-shrink-0 bg-brand-surface-elevated/95 backdrop-blur-xl border-r border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
            isSidebarOpen ? 'w-80' : 'w-0 -translate-x-full'
          }`}
          aria-label="Interaction list sidebar"
          role="complementary"
        >
          <div className={`flex flex-col h-full w-80 transition-opacity duration-300 ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}>
            <div className="flex items-center px-4 py-3 pl-16">
              <span className="text-lg font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
            </div>
            {/* Desktop Conversation List */}
            <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-brand-surface-tertiary" aria-label="Interactions">
              <ConversationList 
                onSelectConversation={handleSelectConversation}
                onDeleteConversation={handleDeleteConversation}
                onNewConversation={handleNewConversation}
                selectedConversationId={conversationId}
                refreshKey={conversationListKey}
              />
            </nav>

            <div className="border-t border-brand-surface-border p-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSignOut();
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl hover:bg-brand-surface-hover text-brand-text-muted hover:text-brand-text-primary transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Floating sidebar toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsSidebarOpen(!isSidebarOpen);
          }}
          className="fixed top-4 left-4 z-50 p-2 text-brand-text-primary hover:text-brand-accent-primary transition-colors duration-200 focus:outline-none"
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {isSidebarOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Main Content Area - Desktop */}
        <main 
          className="flex-1 flex flex-col min-w-0 overflow-hidden relative"
          onClick={() => setIsSidebarOpen(false)}
        >
          {/* Screen reader live region for message updates */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {isWaitingForResponse && 'AI is thinking...'}
            {messages.length > 0 && `Interaction has ${messages.length} messages`}
          </div>

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              {/* Enhanced Chat Area with glass morphism design */}
              {/* Messages with improved styling and animations */}
              <div ref={desktopScrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-brand-surface-tertiary">
                <div className={`mx-auto space-y-6 flex flex-col transition-all duration-300 ${hasSidebarContent ? 'max-w-4xl' : 'max-w-5xl'}`}>
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
                      className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm animate-float">
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
                          className={`message-bubble rounded-2xl px-4 py-3 backdrop-blur-sm
                      transition-all duration-300 hover:scale-[1.02] animate-slide-up
                      ${message.role === 'assistant' ? 'cursor-pointer' : ''}
                      ${message.role === 'user' 
                      ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple hover:shadow-glow-lg' 
                      : 'glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg hover:shadow-neon-blue'
                    }`}
                          onClick={() => {
                            if (message.role === 'assistant') {
                              setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                            }
                          }}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap break-words">
                            {message.content}
                            {message.isTyping && (
                              <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                            )}
                          </p>
                        </div>
                    
                        {/* Show additional details when expanded */}
                        {message.role === 'assistant' && expandedMessageIndex === index && (
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
                        <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass hover:shadow-glow-sm transition-all duration-300">
                          <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
              
                  {isWaitingForResponse && (
                    <div className="flex gap-4 justify-start animate-slide-up">
                      <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                        <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                      </div>
                      <div className="glass text-brand-text-primary border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg">
                        <div className="flex items-center gap-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                            <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                          </div>
                          <span className="text-sm text-brand-text-muted">Brain is thinking...</span>
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
              <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary to-transparent pt-6 pb-4 px-4 sm:px-6">
                <div className={`mx-auto transition-all duration-300 ${hasSidebarContent ? 'max-w-4xl' : 'max-w-5xl'}`}>
                  <form onSubmit={handleSubmit} className="relative">
                    <div className="flex gap-2 items-end bg-brand-surface-elevated/80 backdrop-blur-xl rounded-2xl border border-brand-surface-border/50 p-2 shadow-lg transition-all duration-200 focus-within:border-brand-accent-primary/50 focus-within:shadow-xl">
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
                                ? (effectivePersonality === 'game_master' ? 'What do you do next?' : 'Message Brain...') 
                                : 'Start a new conversation...'
                          }
                          className="w-full px-3 py-3 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-[15px] leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                          disabled={isWaitingForResponse}
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
                        className={`flex-shrink-0 p-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-accent-primary/50 focus:ring-offset-2 focus:ring-offset-brand-bg-primary
                    ${!inputMessage.trim() || isWaitingForResponse
      ? 'bg-brand-surface-hover text-brand-text-muted cursor-not-allowed opacity-50' 
      : 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95'
    }`}
                        disabled={!inputMessage.trim() || isWaitingForResponse}
                        aria-label={isWaitingForResponse ? 'Sending message' : 'Send message'}
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
                    {!isWaitingForResponse && (
                      <div className="mt-2 text-center">
                        <p className="text-xs text-brand-text-muted/50">
                      Press <kbd className="px-1.5 py-0.5 rounded bg-brand-surface-elevated/50 border border-brand-surface-border/30 text-[10px] font-mono">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-brand-surface-elevated/50 border border-brand-surface-border/30 text-[10px] font-mono">Shift+Enter</kbd> for new line
                        </p>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
          
        </main>

        {/* Desktop HUD Sidebar */}
        {hasSidebarContent && (
          <aside className="hidden lg:flex w-96 flex-col border-l border-brand-surface-border/30 px-6 py-6 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary/50 to-transparent">
            <div className="sticky top-10 space-y-6 w-full">
              {conversationId && effectivePersonality !== 'default' && (
                <PersonalityIndicator personality={effectivePersonality} />
              )}

              {conversationId && effectivePersonality === 'game_master' && adventureState && (
                <GameMasterHud
                  adventure={adventureState}
                  questSteps={hudQuestSteps}
                  playerChoices={hudPlayerChoices}
                  character={characterState}
                  isLoadingCharacter={isLoadingCharacter}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile: Main Content Area */}
      <main 
        className="lg:hidden flex flex-col h-full"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Mobile Top Nav Bar */}
        <nav className="sticky top-0 z-[60] bg-brand-surface-elevated/95 backdrop-blur-xl border-b border-brand-surface-border/50 shadow-lg pt-safe">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Hamburger Menu Button - Morphs into X when open */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-brand-surface-hover transition-colors relative z-[70]"
              aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            >
              <svg className="w-6 h-6 text-brand-text-primary transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Title/Branding */}
            <span className="text-lg font-light text-brand-text-primary tracking-wide">Brain in Cup</span>
          </div>
        </nav>

        {/* Floating Expandable Header Bars - Side by Side - Only for Game Master mode */}
        {effectivePersonality === 'game_master' && (
          <div className="lg:hidden sticky top-0 z-40 pt-safe">
            <div className="flex gap-2 mx-4 mt-4 items-start">
              {/* First Bar - Quest Log */}
              <div className="flex-1 relative">
                <div 
                  className={`rounded-2xl bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
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
                  className={`rounded-2xl bg-brand-surface-elevated/95 backdrop-blur-xl border border-brand-surface-border/50 shadow-lg transition-all duration-300 ${
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
                      <div>
                        <h4 className="text-xs uppercase tracking-wider text-brand-text-muted mb-2">Inventory</h4>
                        <div className="space-y-1.5">
                          {charData.inventory.map((item, index) => (
                            <div key={index} className="flex items-center gap-2 text-xs">
                              <span className="text-brand-text-secondary">• {item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
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
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages with improved styling and animations */}
          <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-brand-surface-tertiary flex flex-col">
            <div className="max-w-4xl mx-auto space-y-4 flex flex-col">
              
              {messages.length === 0 && !isLoading && conversationId && (
                <div className="flex justify-center items-center h-full min-h-[300px]">
                  <div className="text-center space-y-3 px-4 mt-64">
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
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-glow-sm">
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
                      className={`message-bubble rounded-2xl px-4 py-3 backdrop-blur-sm
                      transition-all duration-300 hover:scale-[1.02] animate-slide-up
                      ${message.role === 'assistant' ? 'cursor-pointer' : ''}
                      ${message.role === 'user' 
                  ? 'bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary text-white shadow-glow-purple' 
                  : 'glass text-brand-text-primary border border-brand-surface-border shadow-glass-lg'
                }`}
                      onClick={() => {
                        if (message.role === 'assistant') {
                          setExpandedMessageIndex(expandedMessageIndex === index ? null : index);
                        }
                      }}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap break-words text-sm">
                        {message.content}
                        {message.isTyping && (
                          <span className="inline-block w-2 h-5 bg-violet-400 ml-1 animate-pulse"></span>
                        )}
                      </p>
                    </div>
                    
                    {/* Show additional details when expanded */}
                    {message.role === 'assistant' && expandedMessageIndex === index && (
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
                    <div className="w-8 h-8 rounded-xl glass flex items-center justify-center flex-shrink-0 mt-1 border border-brand-surface-border shadow-glass">
                      <svg className="w-4 h-4 text-brand-text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              
              {isWaitingForResponse && (
                <div className="flex gap-3 justify-start animate-slide-up">
                  <div className="w-8 h-8 rounded-xl bg-gradient-mesh flex items-center justify-center flex-shrink-0 mt-1 shadow-neon-purple animate-glow-pulse">
                    <BrainIcon className="w-4 h-4 text-white animate-spin-slow" />
                  </div>
                  <div className="glass text-brand-text-primary border border-brand-surface-border rounded-2xl px-4 py-3 shadow-neon-blue backdrop-blur-lg">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-150"></div>
                        <div className="w-2 h-2 rounded-full bg-brand-accent-primary animate-pulse delay-300"></div>
                      </div>
                      <span className="text-sm text-brand-text-muted">Brain is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Invisible element to scroll to - at the bottom */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Mobile Input Area */}
          <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-brand-bg-primary via-brand-bg-primary to-transparent pt-4 pb-4 px-3 pb-safe">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
                <div className="flex gap-2 items-end bg-brand-surface-elevated/80 backdrop-blur-xl rounded-2xl border border-brand-surface-border/50 p-2 shadow-lg transition-all duration-200 focus-within:border-brand-accent-primary/50 focus-within:shadow-xl">
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
                            ? (effectivePersonality === 'game_master' ? 'What do you do next?' : 'Message Brain...')
                            : 'Start a new conversation...'
                      }
                      className="w-full px-3 py-2.5 resize-none bg-transparent text-brand-text-primary placeholder-brand-text-muted/60 border-0 focus:outline-none focus:ring-0 transition-all duration-200 text-sm leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin scrollbar-thumb-brand-surface-tertiary"
                      disabled={isWaitingForResponse}
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
                    className={`flex-shrink-0 p-2.5 rounded-xl transition-all duration-200 focus:outline-none active:scale-95
                    ${!inputMessage.trim() || isWaitingForResponse
      ? 'bg-brand-surface-hover text-brand-text-muted cursor-not-allowed opacity-50' 
      : 'bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg active:shadow-xl'
    }`}
                    disabled={!inputMessage.trim() || isWaitingForResponse}
                    aria-label={isWaitingForResponse ? 'Sending message' : 'Send message'}
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

      {isModePickerOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={handleModePickerClose}
          />
          <div
            className="relative glass rounded-3xl border border-brand-surface-border shadow-glass-xl w-full max-w-2xl p-6 md:p-8 space-y-6"
            role="dialog"
            aria-modal="true"
          >
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.4em] text-brand-text-muted">Choose a mode</p>
              <h2 className="text-2xl font-semibold text-brand-text-primary">How do you want to explore?</h2>
              <p className="text-sm text-brand-text-secondary">Pick the mode for this interaction.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {MODE_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => handleModeSelected(option.id)}
                  className="text-left rounded-2xl border border-brand-surface-border p-4 glass-hover transition-all duration-300 hover:border-brand-accent-primary/50 hover:shadow-glow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${option.accent} flex items-center justify-center text-xl`}>
                      {option.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-[0.3em] text-brand-text-muted">{option.badge}</span>
                      <span className="text-base font-semibold text-brand-text-primary">{option.title}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-brand-text-secondary">{option.description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={handleModePickerClose}
              className="w-full py-3 rounded-2xl border border-brand-surface-border text-brand-text-muted hover:text-brand-text-primary transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* Install Prompt */}
      <InstallPrompt />

      {/* WIP Banner - only show for Game Master mode when feature flag is enabled */}
      {featureFlags.showGameMasterWIPBanner && effectivePersonality === 'game_master' && <WipBanner />}

      {/* Character Creation Modal */}
      {showCharacterCreation && conversationId && effectivePersonality === 'game_master' && (
        <CharacterCreation
          onComplete={(characterData) => {
            console.log('✨ Character created:', characterData);
            createCharacter(conversationId, characterData);
          }}
          onCancel={() => {
            console.log('❌ Character creation cancelled, using defaults');
            // If user cancels, set a default character
            createCharacter(conversationId, {
              name: 'Adventurer',
              race: 'Human',
              characterClass: 'Wanderer',
            });
          }}
        />
      )}

    </div>
  );
}

export default App;
