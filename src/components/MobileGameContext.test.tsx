import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MobileGameContext from './MobileGameContext';
import ContextWindowPanel from './ContextWindowPanel';

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
afterEach(() => {
  cleanup();
  for (const [key, descriptor] of [['showModal', originalShowModal], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
  vi.restoreAllMocks();
});

it('opens the requested shared context, switches tabs, and restores focus on dismissal', () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
  render(<MobileGameContext characterName="Sera Vane" questTitle="The Missing Constellation"
    renderContext={initialPanel => <ContextWindowPanel initialPanel={initialPanel}
      character={{ name: 'Sera Vane', level: 2 }}
      activeQuests={[{ id: 'quest', title: 'The Missing Constellation' }]} />} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const questTrigger = screen.getByRole('button', { name: /Quest log/ });
  questTrigger.focus();
  fireEvent.click(questTrigger);
  expect(screen.getByRole('tab', { name: 'Quests' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Quests' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Location' })).toHaveFocus();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(questTrigger).toHaveFocus();
  const characterTrigger = screen.getByRole('button', { name: /Character/ });
  characterTrigger.focus();
  fireEvent.click(characterTrigger);
  expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Close adventure context' }));
  expect(characterTrigger).toHaveFocus();
});
