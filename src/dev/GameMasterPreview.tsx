import { useRef, useState, type ComponentProps } from 'react';
import SiteBackground from '../components/SiteBackground';
import BrainIcon from '../components/BrainIcon';
import CharacterCreation from '../components/CharacterCreation';
import ContextWindowPanel from '../components/ContextWindowPanel';
import ChatComposer from '../components/ChatComposer';
import MessageList from '../components/MessageList';
import type { Message } from '../components/MessageBubble';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useChatScroll } from '../hooks/useChatScroll';
import { getAvatarOptionById } from '../constants/gameMasterAvatars';
import { calculateDerivedStats, getAllClasses } from '../game';

type PreviewCharacter = Parameters<ComponentProps<typeof CharacterCreation>['onComplete']>[0];

/** Interactive UI-only demo. No accounts, cloud calls, or persisted game state. */
export default function GameMasterPreview() {
  const [character, setCharacter] = useState<PreviewCharacter | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mobileContextOpen, setMobileContextOpen] = useState(true);
  const draft = useRef('');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll('gm-demo', desktop);
  const avatar = getAvatarOptionById(character?.avatarId ?? '');
  const profession = getAllClasses().find(option => option.name === character?.characterClass);
  const hp = character && profession ? calculateDerivedStats(character, profession.id, 1).maxHP : 0;

  const context = character && <ContextWindowPanel
    currentLocation="Starfall Observatory"
    character={{ name: character.name, level: 1, currentHP: hp, maxHP: hp, avatarSrc: avatar?.srcMedium, avatarSrcWebp: avatar?.srcMedium,
      stats: { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma } }}
    playerState={{ currentLevel: 1, currentXP: 0, xpToNextLevel: 100 }}
    activeQuests={[{ id: 'demo', title: 'The Missing Constellation', currentStep: 'Speak with the observatory keeper.', stepProgress: '1 / 4' }]}
    timelineEntries={messages.map((message, index) => ({ ...message, id: String(index), location: 'Starfall Observatory' }))}>
    <section className="retro-right-section"><h3 className="text-xs uppercase tracking-wider text-brand-text-muted">In your pack</h3>
      <ul className="mt-3 space-y-2 text-sm text-brand-text-secondary">{profession?.startingEquipment.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  </ContextWindowPanel>;

  return <>
    <SiteBackground />
    <div className="retro-rpg-ui cosmic-workspace retro-rpg-ui--gm relative h-dvh overflow-hidden">
      <div className="retro-shell h-full max-lg:!grid-cols-[minmax(0,1fr)]" data-context-open={Boolean(character)}>
        {desktop && <aside className="retro-shell-left items-center gap-6 py-5">
          <a href="/?testmode=true" aria-label="Back to workspace" className="cosmic-rail-control rounded-xl"><BrainIcon className="h-9 w-9" /></a>
          <span className="text-[10px] uppercase tracking-widest text-brand-text-muted [writing-mode:vertical-rl]">Local preview</span>
        </aside>}
        <main className="retro-shell-center min-w-0 overflow-hidden px-2 py-4 sm:px-4 max-lg:!col-start-1">
          <header className="cosmic-workspace-header"><h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1></header>
          {!desktop && character && <aside className="gm-preview-mobile-context" aria-label="Game context">
            <button type="button" aria-expanded={mobileContextOpen} onClick={() => setMobileContextOpen(value => !value)}>
              {character?.name || 'Character'} <span aria-hidden="true">{mobileContextOpen ? '−' : '+'}</span>
            </button>
            {mobileContextOpen && <div className="gm-preview-mobile-body">{context}</div>}
          </aside>}
          <div className="cosmic-chat-viewport">
            <div ref={scrollRef} className="cosmic-chat-scroll min-h-0 flex-1 overflow-y-auto px-2" aria-label="GM preview conversation">
              <div ref={contentRef} className="cosmic-chat-content mx-auto flex max-w-4xl flex-col gap-6">
                <MessageList messages={messages} isGameMasterMode variant={desktop ? 'desktop' : 'mobile'} />
              </div>
            </div>
          </div>
          <div className="retro-input-dock relative px-2 pt-4 sm:px-6">
            {!isAtBottom && <button className="cosmic-jump-to-latest" onClick={scrollToLatest}>Latest messages ↓</button>}
            <ChatComposer draft={draft} isGameMasterMode isLocked={!character} isWaiting={false} isPrimed={false}
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
            <p className="mt-2 text-center text-[11px] text-brand-text-muted">Local demo · <a href="/?testmode=true&preview=gm" className="text-brand-accent-secondary underline">Reset character</a></p>
          </div>
        </main>
        {desktop && character && <aside className="retro-shell-right" aria-label="Game context"><div className="retro-right-container flex h-full min-h-0 flex-col">
          <div className="gm-preview-desktop-context">{context}</div>
        </div></aside>}
      </div>
    </div>
    {!character && <CharacterCreation onComplete={async value => {
      // A short local save makes the locked, in-flight state easy to inspect.
      await new Promise(resolve => window.setTimeout(resolve, 650));
      setCharacter(value);
      setMobileContextOpen(false);
      setMessages([{ role: 'assistant', populateOnMount: true, content:
        'The last tram leaves you beneath **Starfall Observatory**. Violet clouds drift against the wind. A single window is lit.\n\nBeside the door, a woman cups a silver lantern in her hands. “You arrived just in time,” she says. Somewhere above you, a bell rings once.' }]);
    }} onCancel={() => { window.location.href = '/?testmode=true'; }} />}
  </>;
}
