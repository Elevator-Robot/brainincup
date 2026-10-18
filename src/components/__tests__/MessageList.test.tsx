import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageList from '../MessageList';
import type { Message } from '../MessageBubble';
import { DICE_ROLL_DURATION_MS } from '../../utils/diceRolls';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('dice result reveal', () => {
  it('offers only the die and purpose supplied by the active Brain request', () => {
    const onDiceRoll = vi.fn();
    render(<MessageList messages={[{ role: 'assistant', content: '', diceRoll: {
      requestId: 'damage', sides: 8, statName: 'ability', purpose: 'Longsword damage', phase: 'pending',
    } }]} isGameMasterMode variant="desktop" activeDiceRequestId="damage" onDiceRoll={onDiceRoll} />);
    expect(screen.getByRole('heading', { name: 'Longsword damage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roll d20' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(document.querySelector('.cosmic-roll-die-number')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Roll d8' }));
    expect(onDiceRoll).toHaveBeenCalledExactlyOnceWith('damage');
  });

  it('holds early backend narration until the roll finishes', () => {
    const messages: Message[] = [
      { role: 'assistant', content: 'Make a Dexterity check.' },
      { role: 'assistant', content: '', messageId: 'dice:check', diceRoll: {
        requestId: 'check', statName: 'dexterity', phase: 'rolling', value: 14, startedAt: Date.now(), duration: DICE_ROLL_DURATION_MS,
      } },
      { role: 'assistant', content: 'You made it across the ledge.' },
    ];
    const { rerender } = render(<MessageList messages={messages} isGameMasterMode variant="desktop" />);
    expect(screen.getByText('Make a Dexterity check.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rolling…' })).toBeDisabled();
    expect(screen.queryByText('You made it across the ledge.')).not.toBeInTheDocument();
    const completed = messages.map(message => message.diceRoll ? { ...message, diceRoll: { ...message.diceRoll, phase: 'submitted' as const } } : message);
    rerender(<MessageList messages={completed} isGameMasterMode variant="desktop" />);
    expect(screen.getByText('You made it across the ledge.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll recorded' })).toBeDisabled();
  });
});
