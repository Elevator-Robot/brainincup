import { useCallback, useEffect, useRef, useState } from 'react';
import SiteBackground from '../components/SiteBackground';
import BrainIcon from '../components/BrainIcon';
import type { Message } from '../components/MessageBubble';
import ChatTranscript from '../components/ChatTranscript';
import { BRAIN_CHAT, GAME_MASTER_CHAT } from '../chat/experienceAdapters';
import { gameMasterMessageExtension, visibleGameMasterMessages } from '../chat/gameMasterMessages';
import ChatComposer, { type ChatComposerHandle } from '../components/ChatComposer';
import { useChatDiceRolls } from '../hooks/useChatDiceRolls';
import type { DiceRollRequest } from '../utils/diceRolls';
import { useChatScroll } from '../hooks/useChatScroll';
import { useMediaQuery } from '../hooks/useMediaQuery';
import ContextWindowPanel from '../components/ContextWindowPanel';
import { DEFAULT_CHARACTER_AVATAR_ID, getAvatarOptionById } from '../constants/gameMasterAvatars';

const previewAvatar = getAvatarOptionById(DEFAULT_CHARACTER_AVATAR_ID);

const messages: Message[] = [
  { role: 'assistant', content: 'The last tram leaves you at the foot of **Starfall Observatory**. Above the treeline, violet clouds move against the wind. A single window is lit.\n\nIn your pocket, the brass compass ticks once. Its needle points straight up.' },
  { role: 'user', content: 'I check the compass, then walk up to the observatory. Is anyone outside?' },
  { role: 'assistant', content: 'The compass is warm. Tiny letters have appeared around its rim: **Follow what is missing.**\n\nBeside the entrance, a woman in a weathered blue coat is trying to light a lantern. Each time the flame catches, it turns silver and goes out.\n\n“Please tell me you brought a map,” she says. “The stars have stopped agreeing with mine.”' },
  { role: 'user', content: '“No map, but I have something stranger.” I show her the compass and ask what happened to the stars.' },
  { role: 'assistant', content: 'She introduces herself as **Mira**, the observatory’s night keeper. When she sees the compass, her expression changes.\n\n“Three nights ago, a constellation disappeared. Not behind a cloud—gone. Then the telescope started receiving a signal.”\n\nShe unlocks the door. Inside, the walls are covered in handwritten charts. One has a conspicuous blank space where seven stars should be.\n\n### What you notice\n- A fresh trail of blue dust leads upstairs.\n- The signal repeats every **eleven seconds**.\n- Your compass ticks in time with it.' },
  { role: 'user', content: 'I follow the blue dust upstairs, staying quiet. I want to see the telescope before touching anything.' },
  { role: 'assistant', content: 'The stairs open into a circular room beneath the glass dome. Moonlight catches the dust at your feet; it floats upward instead of settling.\n\nThe telescope is pointed at a patch of empty sky. On the desk beside it sits a notebook, a cracked lens, and a cup of tea that is still steaming.\n\nThrough the telescope’s eyepiece, you hear a soft voice:\n\n> “We are still here. You are looking in the wrong direction.”' },
  { role: 'user', content: 'I read the last page of the notebook. Does “the wrong direction” mean we should be looking down?' },
  { role: 'assistant', content: 'The final entry is written in a hurried hand:\n\n> A reflection is not an absence. If the sky forgets its stars, find the water that remembers them.\n\nBelow it is a sketch of the **Stillwater Reservoir**, deep in the valley. Seven small marks are drawn beneath its surface.\n\nMira looks from the notebook to your compass. “There’s an old service tunnel under this building. It runs all the way to the water.”\n\n**Quest updated:** Find the missing constellation at Stillwater.' },
  { role: 'user', content: 'Let’s take the tunnel. I pack the notebook and ask Mira to bring her lantern.' },
  { role: 'assistant', content: 'Mira wraps the lantern in a scarf and hands you the notebook. Together, you descend past the observatory’s humming machinery.\n\nAt the bottom of the stairs, a narrow door opens into cool, mineral-scented air. The blue dust gathers along the tunnel floor like a shallow stream.\n\nFor the first time tonight, your compass needle turns. It points ahead.\n\n**You have:** the brass compass, the keeper’s notebook, and a companion who knows the way.\n\nSomewhere beyond the darkness, water begins to sing.' },
  { role: 'user', content: 'I keep the compass in my hand and follow the sound. What do we see when we reach the water?' },
  { role: 'assistant', content: 'The tunnel ends on a stone balcony above a perfectly still reservoir. No moonlight reaches this far underground, yet the water shines.\n\nSeven stars burn beneath its surface, connected by faint threads of violet light. Their reflection on the cavern ceiling forms a doorway.\n\nMira raises the lantern. This time, the silver flame stays lit.\n\n“Your choice,” she whispers. “We can study it from here—or find out where it leads.”' },
  { role: 'user', content: 'I cross the narrow ledge to get a closer look at the doorway.' },
  { role: 'assistant', content: 'Water has worn the ledge smooth. Halfway across, the stone narrows to a few inches. Make a **Dexterity check** to keep your footing.' },
];

const sampleCheck: DiceRollRequest = {
  requestId: 'preview-ledge-check', statName: 'dexterity', statValue: 16,
  difficultyClass: 15, description: 'Cross the narrow ledge without slipping.',
};

/** Dev-only visual fixture: real UI components, no account or backend writes. */
export default function ConversationPreview() {
  const typewriter = new URLSearchParams(window.location.search).has('typewriter');
  const thoughts = new URLSearchParams(window.location.search).has('thoughts');
  const [conversation, setConversation] = useState<Message[]>(() => thoughts ? [{
    role: 'assistant',
    content: 'The stars above the observatory have begun to drift. Not randomly—each one is moving toward the same quiet point in the sky.\n\nYour compass gives a single, soft pulse. **Something remembers the way home.**',
    sensations: ['A cool shimmer of light; the faint warmth of the brass compass.'],
    thoughts: ['The stars and the compass seem to be responding to the same distant signal.'],
    memories: 'Mira once spoke of a constellation that disappeared without leaving a trace.',
    selfReflection: 'There may be more to discover in what is missing than in what is visible.',
  }] : typewriter ? [{
    role: 'assistant', populateOnMount: true,
    content: 'The observatory falls quiet. Beyond the glass, a silver constellation begins to move.\n\nYour compass warms in your hand, its needle turning toward **a doorway made of starlight**. Mira raises her lantern.\n\n“Some stories wait to be discovered,” she whispers. “This one has been waiting for you.”\n\n### What lies ahead\n- A violet glow beneath the old stone stairs.\n- A distant voice calling your name.\n- One small, impossible choice.\n\n**What do you do next?**',
  }] : messages);
  const draft = useRef('');
  const composer = useRef<ChatComposerHandle>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { scrollRef, contentRef, isAtBottom, scrollToLatest } = useChatScroll('preview', isDesktop);
  const empty = new URLSearchParams(window.location.search).has('empty');
  const submitPreviewRoll = useCallback(async (_request: DiceRollRequest, value: number) => {
    await new Promise<void>(resolve => window.setTimeout(resolve, 1800));
    const total = value + 3;
    setConversation(previous => [...previous, { role: 'assistant', content: total >= 15
      ? `**${value} + 3 = ${total}.** You reach the other side. From here, you can see steps descending through the reflection in the water. Mira follows, keeping one hand against the cavern wall.`
      : `**${value} + 3 = ${total}.** Your boot slips on the wet stone. You catch the edge and pull yourself back onto the balcony. Mira reaches out a hand. The doorway is still there, but you’ll need another approach.` }]);
  }, []);
  const { requestRoll, roll, activeRequestId, hasPendingRoll } = useChatDiceRolls({
    conversationId: 'preview', messages: conversation, setMessages: setConversation, busy: false, onSubmit: submitPreviewRoll,
  });
  useEffect(() => { if (!empty && !typewriter && !thoughts) requestRoll(sampleCheck); }, [empty, typewriter, thoughts, requestRoll]);
  return <>
    <SiteBackground />
    <div className={`retro-rpg-ui cosmic-workspace retro-rpg-ui--${thoughts ? 'brain' : 'gm'} relative h-dvh overflow-hidden`}>
      <div className="retro-shell h-full max-lg:!grid-cols-[minmax(0,1fr)]">
        {isDesktop && <aside className="retro-shell-left items-center gap-6 py-5">
          <a href="/?testmode=true" aria-label="Back to workspace" className="cosmic-rail-control rounded-xl"><BrainIcon className="h-9 w-9" /></a>
          <span className="text-[10px] uppercase tracking-widest text-brand-text-muted [writing-mode:vertical-rl]">Visual preview</span>
        </aside>}
        <main className="retro-shell-center min-w-0 overflow-hidden px-2 py-4 sm:px-4 max-lg:!col-start-1">
          <header className="cosmic-workspace-header"><h1 className="cosmic-wordmark"><strong>Brain</strong> in Cup</h1></header>
          <ChatTranscript messages={empty ? [] : thoughts ? conversation : visibleGameMasterMessages(conversation)} scrollRef={scrollRef} contentRef={contentRef}
            renderExtension={gameMasterMessageExtension({ activeRequestId: activeRequestId, onRoll: roll })} />
          <div className="retro-input-dock relative px-2 pt-4 sm:px-6">
            {!isAtBottom && <button className="cosmic-jump-to-latest" onClick={scrollToLatest}>Latest messages ↓</button>}
            <ChatComposer ref={composer} draft={draft} configuration={thoughts ? BRAIN_CHAT : GAME_MASTER_CHAT} isLocked={!empty && hasPendingRoll} isWaiting={false} isPrimed={false} placeholder={!empty && hasPendingRoll ? 'Resolve the requested check above…' : 'What do you do next?'}
              onSend={async content => { setConversation(previous => [...previous, { role: 'user', content }]); scrollToLatest(); return true; }} />
            <p className="mt-2 text-center text-[11px] text-brand-text-muted">Local visual preview · <a className="text-brand-accent-secondary underline underline-offset-2" href="/?testmode=true&preview=conversation&typewriter=true">Replay text reveal</a> · <a className="text-brand-accent-secondary underline underline-offset-2" href="/?testmode=true&preview=dice">Dice set</a></p>
          </div>
        </main>
        {isDesktop && <aside className="retro-shell-right">
          <div className="retro-right-container flex h-full min-h-0 flex-col">
            <div className="retro-right-stack flex min-h-0 flex-1 flex-col">
              <ContextWindowPanel currentLocation="Stillwater Reservoir"
                character={{ name: 'The Wanderer', level: 3, currentHP: 24, maxHP: 28, avatarSrc: previewAvatar?.src, avatarSrcWebp: previewAvatar?.srcMedium,
                  stats: { strength: 12, dexterity: 16, constitution: 13, intelligence: 14, wisdom: 15, charisma: 10 } }}
                playerState={{ currentLevel: 3, currentXP: 640, xpToNextLevel: 900 }}
                activeQuests={[{ id: 'preview-quest', title: 'The Missing Constellation', currentStep: 'Explore the light beneath Stillwater', stepProgress: '2 / 4' }]}
                timelineEntries={messages.map((message, i) => ({ ...message, id: String(i), location: 'Starfall Observatory' }))}>
                <div className="retro-right-section mt-4"><p className="text-sm font-semibold text-brand-text-secondary">In your pack</p><ul className="mt-3 space-y-2 text-sm text-brand-text-muted"><li>Brass compass</li><li>Keeper’s notebook</li><li>Silver lantern</li></ul></div>
              </ContextWindowPanel>
            </div>
          </div>
        </aside>}
      </div>
    </div>
  </>;
}
