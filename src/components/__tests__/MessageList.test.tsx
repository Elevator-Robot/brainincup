import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageList from '../MessageList';
import type { Message } from '../MessageBubble';
import { DICE_ROLL_DURATION_MS } from '../../utils/diceRolls';

vi.mock('../DiceRoller', () => ({ default: () => <span aria-hidden="true" /> }));
beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => vi.unstubAllGlobals());

describe('dice result reveal', () => {
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
