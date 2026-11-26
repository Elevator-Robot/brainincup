import { useMemo, useRef, useState, type ComponentProps } from 'react';
import SiteBackground from '../components/SiteBackground';
import BrainIcon from '../components/BrainIcon';
import CharacterCreation from '../components/CharacterCreation';
import ContextWindowPanel from '../components/ContextWindowPanel';
import MobileGameContext from '../components/MobileGameContext';
import InventoryManager, { type InventoryItem } from '../components/InventoryManager';
import ChatComposer from '../components/ChatComposer';
import ChatTranscript from '../components/ChatTranscript';
import { GAME_MASTER_CHAT } from '../chat/experienceAdapters';
import type { Message } from '../components/MessageBubble';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useChatScroll } from '../hooks/useChatScroll';
import { useContextUpdates } from '../hooks/useContextUpdates';
import { useWorkspaceViewport } from '../hooks/useWorkspaceViewport';
import type { ContextPanel } from '../hooks/useContextPanel';
import { demoCharacter, demoMessages } from './gmDemoConversation';
import { getAvatarOptionById } from '../constants/gameMasterAvatars';
import { calculateDerivedStats, getAllClasses } from '../game';

type PreviewCharacter = Parameters<ComponentProps<typeof CharacterCreation>['onComplete']>[0];
const ready = new URLSearchParams(window.location.search).get('ready') === 'true';
const sampleCharacter: PreviewCharacter = {
  name: demoCharacter.name ?? 'Sera Vane', race: demoCharacter.race ?? 'Halfling', characterClass: demoCharacter.characterClass ?? 'Rogue',
  avatarId: demoCharacter.avatarId ?? '', strength: demoCharacter.strength ?? 9, dexterity: demoCharacter.dexterity ?? 16,
  constitution: demoCharacter.constitution ?? 13, intelligence: demoCharacter.intelligence ?? 12,
  wisdom: demoCharacter.wisdom ?? 14, charisma: demoCharacter.charisma ?? 15,
};

/** Interactive UI-only demo. No accounts, cloud calls, or persisted game state. */
export default function GameMasterPreview() {
  const [character, setCharacter] = useState<PreviewCharacter | null>(ready ? sampleCharacter : null);
  const [messages, setMessages] = useState<Message[]>(ready ? demoMessages.map(message => ({ ...message, populateOnMount: false })) : []);
  const [inventory, setInventory] = useState<InventoryItem[]>(ready ? JSON.parse(String(demoCharacter.inventory)) : []);
  const [questStep, setQuestStep] = useState(1);
  const quests = useMemo(() => character ? [{
    id: 'demo', title: 'The Missing Constellation',
    currentStep: questStep === 1 ? 'Speak with the observatory keeper.' : 'Bring the starlight shard to the telescope.',
    stepProgress: `${questStep} / 4`,
  }] : undefined, [character, questStep]);
  const updates = useContextUpdates('gm-demo', character ? inventory : undefined, quests);
  const workspaceRef = useWorkspaceViewport();
  const draft = useRef('');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll('gm-demo', desktop);
  const avatar = getAvatarOptionById(character?.avatarId ?? '');
  const profession = getAllClasses().find(option => option.name === character?.characterClass);
  const hp = character && profession ? calculateDerivedStats(character, profession.id, 1).maxHP : 0;

  const context = (initialPanel: ContextPanel = 'character') => character && <ContextWindowPanel
    initialPanel={initialPanel} updates={updates}
    currentLocation="Starfall Observatory"
    character={{ name: character.name, level: 1, currentHP: hp, maxHP: hp, avatarSrc: avatar?.srcMedium, avatarSrcWebp: avatar?.srcMedium,
      stats: { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma } }}
    playerState={{ currentLevel: 1, currentXP: 0, xpToNextLevel: 100 }}
    activeQuests={quests}
    timelineEntries={messages.map((message, index) => ({ ...message, id: String(index), location: 'Starfall Observatory' }))}>
    <InventoryManager inventory={inventory} onUpdateInventory={async items => setInventory(items)} updates={updates.inventory} />
  </ContextWindowPanel>;

  return <>
    <SiteBackground />
    <div ref={workspaceRef} className="retro-rpg-ui cosmic-workspace retro-rpg-ui--gm relative h-dvh overflow-hidden">
      <p className="sr-only" role="status">{[updates.inventory.notice, updates.quests.notice].filter(Boolean).join('. ')}</p>
      <div className="retro-shell h-full max-lg:!grid-cols-[minmax(0,1fr)]" data-context-open={Boolean(character)}>
        {desktop && <aside className="retro-shell-left items-center gap-6 py-5">
          <a href="/?testmode=true" aria-label="Back to workspace" className="cosmic-rail-control rounded-xl"><BrainIcon className="h-9 w-9" /></a>
          <span className="text-[10px] uppercase tracking-widest text-brand-text-muted [writing-mode:vertical-rl]">Local preview</span>
        </aside>}
        <main className="retro-shell-center min-w-0 overflow-hidden px-2 py-4 sm:px-4 max-lg:!col-start-1">
          <header className="cosmic-workspace-header"><h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1></header>
          {!desktop && character && <MobileGameContext characterName={character.name}
            avatarSrc={avatar?.srcMedium} avatarSrcWebp={avatar?.srcMedium}
            questTitle={quests?.[0]?.title} inventoryNotice={updates.inventory.notice} questNotice={updates.quests.notice}
            renderContext={context} />}
          <ChatTranscript messages={messages} scrollRef={scrollRef} contentRef={contentRef} />
          <div className="retro-input-dock relative px-2 pt-4 sm:px-6">
            {!isAtBottom && <button className="cosmic-jump-to-latest" onClick={scrollToLatest}>Latest messages ↓</button>}
            <ChatComposer draft={draft} configuration={GAME_MASTER_CHAT} isLocked={!character} isWaiting={false} isPrimed={false}
              placeholder="What do you do next?" onSend={async content => {
                const input = content.toLowerCase();
                const reply = input.includes('inventory') ? `In your pack: ${profession?.startingEquipment.join(', ')}.`
                  : input.includes('quest') ? 'Your next task is to speak with the observatory keeper about the missing constellation.'
                    : input.includes('conversation') ? '“Mira,” she says, offering you the lantern. “Three nights ago, seven stars disappeared. Tonight, they started calling back.”'
                      : 'Blue dust glimmers on the stairs. Above you, the telescope turns toward a patch of empty sky. Mira waits by the open door.';
                setMessages(previous => [...previous, { role: 'user', content }, { role: 'assistant', content: reply, populateOnMount: true }]);
                scrollToLatest();
                return true;
              }} />
            <div className="cosmic-preview-controls">
              <span>Local UI fixture</span>
              <button type="button" disabled={!character} onClick={() => {
                setInventory(items => items.some(item => item.id === 'shard')
                  ? items.map(item => item.id === 'shard' ? { ...item, quantity: (item.quantity ?? 1) + 1 } : item)
                  : [...items, { id: 'shard', name: 'Starlight Shard', type: 'quest', quantity: 1 }]);
                setQuestStep(step => Math.min(4, step + 1));
              }}>Simulate game update</button>
              <a href="/?testmode=true&preview=gm">Reset character</a>
            </div>
          </div>
        </main>
        {desktop && character && <aside className="retro-shell-right" aria-label="Game context"><div className="retro-right-container flex h-full min-h-0 flex-col">
          <div className="gm-preview-desktop-context">{context()}</div>
        </div></aside>}
      </div>
    </div>
    {!character && <CharacterCreation onComplete={async value => {
      // A short local save makes the locked, in-flight state easy to inspect.
      await new Promise(resolve => window.setTimeout(resolve, 650));
      setCharacter(value);
      setInventory((getAllClasses().find(option => option.name === value.characterClass)?.startingEquipment ?? [])
        .map((name, index) => ({ id: `starting-${index}`, name, type: 'consumable' })));
      setMessages([{ role: 'assistant', populateOnMount: true, content:
        'The last tram leaves you beneath **Starfall Observatory**. Violet clouds drift against the wind. A single window is lit.\n\nBeside the door, a woman cups a silver lantern in her hands. “You arrived just in time,” she says. Somewhere above you, a bell rings once.' }]);
    }} onCancel={() => { window.location.href = '/?testmode=true'; }} />}
  </>;
}
