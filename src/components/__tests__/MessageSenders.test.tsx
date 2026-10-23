import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import MessageList from '../MessageList';

afterEach(cleanup);

it.each([
  ['Brain', 'desktop', false], ['Brain', 'mobile', false],
  ['GM', 'desktop', true], ['GM', 'mobile', true],
] as const)('labels both senders in %s mode on %s', (_mode, variant, isGameMasterMode) => {
  render(<MessageList messages={[
    { role: 'user', content: 'Hello there.' },
    { role: 'assistant', content: 'Good to see you.' },
  ]} variant={variant} isGameMasterMode={isGameMasterMode} />);
  const user = screen.getByText('Hello there.').closest('.message-bubble') as HTMLElement;
  const assistant = screen.getByText('Good to see you.').closest('.message-bubble') as HTMLElement;
  expect(within(user).getByText('You')).toHaveClass('uppercase');
  expect(within(assistant).getByText('Brain')).toHaveClass('uppercase');
});

it('labels a Brain message before its streamed text arrives', () => {
  render(<MessageList messages={[{ role: 'assistant', content: '', isTyping: true }]} variant="desktop" isGameMasterMode={false} />);
  expect(screen.getByText('Brain')).toBeInTheDocument();
});
