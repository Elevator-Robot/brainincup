import { useState } from 'react';
import SiteBackground from '../components/SiteBackground';
import BrainIcon from '../components/BrainIcon';
import { MessageBubble, type Message } from '../components/MessageBubble';
import ContextWindowPanel from '../components/ContextWindowPanel';

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
];

/** Dev-only visual fixture: real UI components, no account or backend writes. */
export default function ConversationPreview() {
  const [expanded, setExpanded] = useState<number | null>(null);
  return <>
    <SiteBackground />
    <div className="retro-rpg-ui retro-rpg-ui--gm relative h-dvh overflow-hidden">
      <div className="retro-shell h-full !grid-cols-[3.5rem_minmax(0,1fr)] lg:!grid-cols-[4.5rem_minmax(0,1fr)_19rem]">
        <aside className="retro-shell-left items-center gap-6 py-5">
          <a href="/?testmode=true" aria-label="Back to workspace" className="rounded-xl"><BrainIcon className="h-9 w-9" /></a>
          <span className="text-[10px] uppercase tracking-widest text-brand-text-muted [writing-mode:vertical-rl]">Visual preview</span>
        </aside>
        <main className="retro-shell-center min-w-0 overflow-hidden px-2 py-4 sm:px-4">
          <div className="mb-4 text-center"><span className="retro-title text-xl">Brain in Cup</span><p className="mt-1 text-[11px] text-brand-text-muted">Starfall Observatory · Sample conversation</p></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Sample conversation">
            <div className="mx-auto flex max-w-4xl flex-col gap-6 py-3">
              {messages.map((message, index) => <MessageBubble key={index} message={message} isGameMasterMode
                variant="desktop" expanded={expanded === index} onToggleExpanded={() => setExpanded(expanded === index ? null : index)} />)}
            </div>
          </div>
          <div className="retro-input-dock px-2 pt-4 sm:px-6">
            <div className="retro-input-shell mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border p-3">
              <textarea aria-label="Preview composer" className="retro-input-textarea min-w-0 flex-1 resize-none bg-transparent p-1" rows={1} readOnly placeholder="What do you do next?" />
              <button type="button" disabled aria-label="Send unavailable in visual preview" className="retro-send-button retro-send-button-disabled h-10 w-10 rounded-xl text-brand-text-muted">↑</button>
            </div>
            <p className="mt-2 text-center text-[11px] text-brand-text-muted">Visual preview only · Scroll to see the full conversation</p>
          </div>
        </main>
        <aside className="retro-shell-right retro-right-container hidden p-4 lg:flex">
          <ContextWindowPanel currentLocation="Stillwater Reservoir"
            character={{ name: 'The Wanderer', level: 3, currentHP: 24, maxHP: 28, stats: { strength: 12, dexterity: 16, constitution: 13, intelligence: 14, wisdom: 15, charisma: 10 } }}
            playerState={{ currentLevel: 3, currentXP: 640, xpToNextLevel: 900 }}
            activeQuests={[{ id: 'preview-quest', title: 'The Missing Constellation', currentStep: 'Explore the light beneath Stillwater', stepProgress: '2 / 4' }]}
            timelineEntries={messages.map((message, i) => ({ ...message, id: String(i), location: 'Starfall Observatory' }))}>
            <div className="retro-right-section mt-4"><p className="text-sm font-semibold text-brand-text-secondary">In your pack</p><ul className="mt-3 space-y-2 text-sm text-brand-text-muted"><li>Brass compass</li><li>Keeper’s notebook</li><li>Silver lantern</li></ul></div>
          </ContextWindowPanel>
        </aside>
      </div>
    </div>
  </>;
}
