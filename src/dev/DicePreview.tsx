import { useRef, type CSSProperties } from 'react';
import SiteBackground from '../components/SiteBackground';
import DiceScene from '../components/dice/DiceScene';
import { DICE_SIDES, DIE_STYLES, type DiceSides } from '../game/dice';
import { DICE_ROLL_DURATION_MS } from '../utils/diceRolls';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageVisible } from '../hooks/usePageVisible';
import { useDicePreviewRolls } from './useDicePreviewRolls';

/** Development-only dice table. Each asset has its own value and roll clock. */
export default function DicePreview() {
  const stage = useRef<HTMLSpanElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const visible = usePageVisible();
  const { dice, rolls, roll, rollingCount } = useDicePreviewRolls(reducedMotion);
  const resultFor = (sides: DiceSides) => {
    if (sides === 100) {
      const tens = rolls['d100-tens'];
      const units = rolls['d100-units'];
      if (tens?.isRolling || units?.isRolling) return '…';
      return tens && units ? tens.value + units.value || 100 : '—';
    }
    const state = rolls[`d${sides}`];
    return state?.isRolling ? '…' : state?.value ?? '—';
  };
  const status = rollingCount ? `Rolling ${rollingCount} ${rollingCount === 1 ? 'die' : 'dice'}…` : 'Click a die to roll it';

  return <>
    <SiteBackground />
    <div className="retro-rpg-ui retro-rpg-ui--gm cosmic-dice-lab">
      <header className="cosmic-dice-lab-header">
        <a href="/?testmode=true&preview=conversation" className="cosmic-dice-lab-back" aria-label="Back to chat preview">← <span>Back to chat</span></a>
        <span className="cosmic-wordmark"><strong>Brain</strong> in Cup</span>
        <span className="cosmic-dice-lab-status">{status}</span>
      </header>
      <main className="cosmic-dice-lab-main">
        <div className="cosmic-dice-lab-title"><h1>Dice set</h1><p>Six standard dice and a percentile pair.</p></div>
        <figure className="cosmic-dice-table" aria-label="Geometric D&D dice set">
          <span ref={stage} className="cosmic-roll-die cosmic-roll-die--multiple cosmic-dice-collection"
            style={{ '--dice-roll-duration': `${DICE_ROLL_DURATION_MS}ms` } as CSSProperties}>
            <DiceScene dice={dice} collection rollNonce={0} isRolling={false} rollStates={rolls} duration={DICE_ROLL_DURATION_MS} active={visible} motion={!reducedMotion} stageRef={stage}
              canActivate onDieActivate={roll} actionLabel={(die, rolling) => `${rolling ? 'Rolling' : 'Roll'} ${die.label}`} />
          </span>
        </figure>
        <ul className="cosmic-dice-results" aria-label="Dice results">
          {DICE_SIDES.map(sides => <li key={sides}>
            <h2 style={{ color: DIE_STYLES[sides === 100 ? 'percentile' : sides].color }}>d{sides}</h2>
            <p className="cosmic-dice-result-value">{resultFor(sides)}</p>
            <p>{sides === 100 ? 'Tens + units' : DIE_STYLES[sides].shape}</p>
          </li>)}
        </ul>
        <p className="cosmic-dice-lab-note">Roll percentile tens and units separately. 00 + 0 counts as 100.</p>
        <p className="cosmic-dice-lab-note">Local preview · In-game rolls are requested by Brain.</p>
        <span className="sr-only" role="status" aria-live="polite">{status}. {dice.filter(die => rolls[die.id] && !rolls[die.id].isRolling).map(die => `${die.label}: ${die.value}`).join('. ')}</span>
      </main>
    </div>
  </>;
}
